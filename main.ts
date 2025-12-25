/**
 * 7TV Emotes for Obsidian
 * 
 * Integrates 7TV (Twitch) emotes into Obsidian markdown editor with auto-complete,
 * multiple caching strategies, and streamer-specific emote sets.
 * 
 * @version 1.0.3 * @license MIT
 * @author Tinerou
 */

import {
    App, Editor, EditorSuggest, EditorPosition,
    EditorSuggestContext, EditorSuggestTriggerInfo,
    FuzzySuggestModal, FuzzyMatch, Plugin, PluginSettingTab, Setting,
    Notice, MarkdownView, Modal
} from 'obsidian';

// =====================================================================
// CONFIGURATION INTERFACES AND CONSTANTS
// =====================================================================

/**
 * Defines the structure of plugin settings persisted to Obsidian's configuration storage.
 * 
 * @property twitchUserId - Numeric Twitch identifier for emote set retrieval via 7TV API
 * @property selectedStreamerId - Internal key mapping to built-in streamer presets
 * @property cacheStrategy - Storage behavior for emote images: 'on-demand' or 'no-cache'
 * @property logLevel - Verbosity control for plugin logging system
 * @property builtInStreamers - Array of streamers loaded from JSON file
 */
interface SevenTVSettings {
    twitchUserId: string;
    selectedStreamerId: string;
    cacheStrategy: 'on-demand' | 'no-cache';
    logLevel: 'none' | 'basic' | 'verbose' | 'debug';
    builtInStreamers?: Array<{
        displayName: string;
        twitchId: string;
        internalKey: string;
    }>;
}

/**
 * Default configuration values applied during initial plugin installation.
 * 
 * @constant twitchUserId - Empty string for manual entry
 * @constant selectedStreamerId - No preset selection initially
 * @constant cacheStrategy - Balanced approach caching emotes on first use
 * @constant logLevel - Basic operational logging without debug overhead
 * @constant builtInStreamers - Empty array, will be populated from streamers.json
 */
const DEFAULT_SETTINGS: SevenTVSettings = {
    twitchUserId: '',
    selectedStreamerId: '',
    cacheStrategy: 'on-demand',
    logLevel: 'basic',
    builtInStreamers: [] // Will be populated from streamers.json
}

// =====================================================================
// DOWNLOAD PROGRESS TRACKER
// =====================================================================

/**
 * Manages visual feedback for batch emote downloading operations.
 * 
 * Provides real-time progress indication with byte-level tracking,
 * download speed calculation, and cancellation support.
 */
class DownloadProgressTracker {
    private plugin: SevenTVPlugin;
    private totalEmotes: number = 0;
    private downloadedEmotes: number = 0;
    private failedEmotes: number = 0;
    private totalBytes: number = 0;
    private downloadedBytes: number = 0;
    private statusBarEl: HTMLElement | null = null;
    private isActive: boolean = false;
    private isCancelled: boolean = false;
    private startTime: number = 0;
    private currentBatch: number = 0;
    private totalBatches: number = 0;
    private onCancelCallback: (() => void) | null = null;

    /**
     * Creates a new progress tracker instance.
     * 
     * @param plugin - Main plugin instance for logging coordination
     */
    constructor(plugin: SevenTVPlugin) {
        this.plugin = plugin;
    }

    /**
     * Initializes tracking for a new download session.
     * 
     * @param totalEmotes - Total number of emotes to download
     * @param onCancel - Optional callback executed on user cancellation
     */
    start(totalEmotes: number, onCancel?: () => void): void {
        this.totalEmotes = totalEmotes;
        this.downloadedEmotes = 0;
        this.failedEmotes = 0;
        this.totalBytes = 0;
        this.downloadedBytes = 0;
        this.isActive = true;
        this.isCancelled = false;
        this.startTime = Date.now();
        this.currentBatch = 0;
        this.totalBatches = Math.ceil(totalEmotes / 3); // 3 per batch
        this.onCancelCallback = onCancel || null;
        
        this.createStatusBar();
        this.updateStatusBar();
        
        this.plugin.logMessage(`Initiating download of ${totalEmotes} emotes`, 'basic');
    }

    /**
     * Creates or updates the floating status bar element.
     */
    private createStatusBar(): void {
        if (!this.statusBarEl) {
            this.statusBarEl = document.createElement('div');
            this.statusBarEl.className = 'seven-tv-download-progress';
            document.body.appendChild(this.statusBarEl);
        }
    }

    /**
     * Converts byte counts to human-readable format.
     * 
     * @param bytes - Raw byte count to format
     * @returns Formatted string (e.g., "1.5 MB", "256 KB")
     */
    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Updates status bar content with current progress metrics.
     */
    private updateStatusBar(): void {
        if (!this.statusBarEl || !this.isActive) return;
        
        // Clear existing content using safe method
        this.statusBarEl.empty();
        
        const elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
        const progress = this.totalEmotes > 0 ? (this.downloadedEmotes / this.totalEmotes) * 100 : 0;
        const speed = elapsedSeconds > 0 ? this.downloadedBytes / elapsedSeconds : 0;
        
        // Header section
        const headerContainer = createDiv({ cls: 'seven-tv-progress-header' });
        
        const title = headerContainer.createEl('strong');
        title.textContent = '📥 7TV Emote Cache';
        
        const batchInfo = headerContainer.createEl('span');
        batchInfo.textContent = `Batch ${this.currentBatch}/${this.totalBatches}`;
        batchInfo.addClass('seven-tv-batch-info');
        
        this.statusBarEl.appendChild(headerContainer);
        
        // Progress section
        const progressContainer = createDiv({ cls: 'seven-tv-progress-container' });
        
        const progressHeader = createDiv({ cls: 'seven-tv-progress-header-row' });
        
        const progressText = progressHeader.createEl('span');
        progressText.textContent = `Progress: ${this.downloadedEmotes}/${this.totalEmotes}`;
        
        const progressPercent = progressHeader.createEl('span');
        progressPercent.textContent = `${progress.toFixed(1)}%`;
        
        progressContainer.appendChild(progressHeader);
        
        // Progress bar
        const progressBarContainer = createDiv({ cls: 'seven-tv-progress-bar-container' });
        
        const progressBar = createDiv({ cls: 'seven-tv-progress-bar' });
        // Only keep width as inline style since it's dynamic
        progressBar.style.width = `${progress}%`;
        
        progressBarContainer.appendChild(progressBar);
        progressContainer.appendChild(progressBarContainer);
        
        // Size/speed info
        const sizeInfo = createDiv({ cls: 'seven-tv-size-info' });
        
        const sizeText = sizeInfo.createEl('span');
        sizeText.textContent = `${this.formatBytes(this.downloadedBytes)} / ${this.formatBytes(this.totalBytes)}`;
        
        const speedText = sizeInfo.createEl('span');
        speedText.textContent = `${this.formatBytes(speed)}/s`;
        
        progressContainer.appendChild(sizeInfo);
        this.statusBarEl.appendChild(progressContainer);
        
        // Footer section
        const footer = createDiv({ cls: 'seven-tv-progress-footer' });
        
        const timer = footer.createEl('span', { cls: 'seven-tv-timer' });
        timer.textContent = `⏱️ ${elapsedSeconds}s`;
        
        const failedInfo = footer.createEl('span', { cls: 'seven-tv-failed-info' });
        if (this.failedEmotes > 0) {
            failedInfo.textContent = `❌ ${this.failedEmotes} failed`;
        }
        
        // Cancel button
        const cancelButton = footer.createEl('button', { cls: 'seven-tv-cancel-button mod-warning' });
        cancelButton.textContent = 'Cancel';
        cancelButton.addEventListener('click', () => this.cancel());
        
        this.statusBarEl.appendChild(footer);
    }

    /**
     * Cancels active download operation and triggers cleanup.
     */
    cancel(): void {
        if (!this.isActive) return;
        
        this.isCancelled = true;
        this.isActive = false;
        this.plugin.logMessage('Download cancelled by user', 'basic');
        
        if (this.onCancelCallback) {
            this.onCancelCallback();
        }
        
        if (this.statusBarEl) {
            this.statusBarEl.empty();
            
            const container = this.statusBarEl.createDiv({ cls: 'seven-tv-cancelled-container' });
            
            const title = container.createDiv({ cls: 'seven-tv-cancelled-title' });
            title.textContent = '❌ Download Cancelled';
            
            const stats = container.createDiv({ cls: 'seven-tv-cancelled-stats' });
            stats.textContent = `${this.downloadedEmotes - this.failedEmotes}/${this.totalEmotes} emotes cached`;
            
            const bytes = container.createDiv({ cls: 'seven-tv-cancelled-bytes' });
            bytes.textContent = `${this.formatBytes(this.downloadedBytes)} downloaded`;
        }
    }

    /**
     * Updates total byte estimate for download session.
     * 
     * @param bytes - Estimated total bytes for all emotes
     */
    setTotalBytes(bytes: number): void {
        this.totalBytes = bytes;
        this.updateStatusBar();
    }

    /**
     * Records successful emote download with byte count.
     * 
     * @param bytes - Bytes downloaded for this emote
     */
    recordSuccess(bytes: number = 0): void {
        if (!this.isActive) return;
        this.downloadedEmotes++;
        this.downloadedBytes += bytes;
        this.updateStatusBar();
    }

    /**
     * Records failed emote download attempt.
     */
    recordFailure(): void {
        if (!this.isActive) return;
        this.failedEmotes++;
        this.updateStatusBar();
    }

    /**
     * Updates batch progress information.
     * 
     * @param batchIndex - Current batch number (1-indexed)
     */
    updateBatch(batchIndex: number): void {
        if (!this.isActive) return;
        this.currentBatch = batchIndex;
        this.updateStatusBar();
    }

    /**
     * Completes download session with final statistics.
     */
    complete(): void {
        this.isActive = false;
        const totalTime = Math.floor((Date.now() - this.startTime) / 1000);
        
        if (this.statusBarEl && !this.isCancelled) {
            const successRate = this.totalEmotes > 0 ? 
                ((this.downloadedEmotes - this.failedEmotes) / this.totalEmotes * 100).toFixed(1) : '0';
            const avgSpeed = totalTime > 0 ? this.downloadedBytes / totalTime : 0;
            
            // Clear existing content
            this.statusBarEl.empty();
            
            // Create main container
            const container = this.statusBarEl.createDiv({ cls: 'seven-tv-complete-container' });
            
            // Create title
            const title = container.createDiv({ cls: 'seven-tv-complete-title' });
            title.textContent = '✅ Download Complete';
            
            // Create stats line 1
            const stats1 = container.createDiv({ cls: 'seven-tv-complete-stats1' });
            stats1.textContent = `${this.downloadedEmotes - this.failedEmotes}/${this.totalEmotes} emotes cached`;
            
            // Create stats line 2
            const stats2 = container.createDiv({ cls: 'seven-tv-complete-stats2' });
            stats2.textContent = `${this.formatBytes(this.downloadedBytes)} total`;
            
            // Create success rate line
            const successRateEl = container.createDiv({ cls: 'seven-tv-success-rate' });
            successRateEl.textContent = `${successRate}% success in ${totalTime}s (${this.formatBytes(avgSpeed)}/s avg)`;
            
            window.setTimeout(() => {
                if (this.statusBarEl && this.statusBarEl.parentNode) {
                    this.statusBarEl.remove();
                    this.statusBarEl = null;
                }
            }, 5000);
        }
        
        if (!this.isCancelled) {
            this.plugin.logMessage(
                `Download completed: ${this.downloadedEmotes - this.failedEmotes}/${this.totalEmotes} ` +
                `emotes (${this.formatBytes(this.downloadedBytes)}) in ${totalTime}s`, 
                'basic'
            );
        }
    }

    /**
     * Checks if download cancellation was requested.
     * 
     * @returns True if user requested cancellation
     */
    isCancelledRequested(): boolean {
        return this.isCancelled;
    }

    /**
     * Cleans up tracker resources and DOM elements.
     */
    cleanup(): void {
        if (this.statusBarEl && this.statusBarEl.parentNode) {
            this.statusBarEl.remove();
            this.statusBarEl = null;
        }
        this.isActive = false;
        this.isCancelled = false;
    }
}

// =====================================================================
// PLUGIN LOGGER - FIXED VERSION
// =====================================================================

/**
 * Configurable logging utility with verbosity levels.
 * 
 * Provides filtered console output with performance timing capabilities
 * for debugging and operational monitoring.
 */
class PluginLogger {
    private plugin: SevenTVPlugin;
    private defaultLogLevel: 'none' | 'basic' | 'verbose' | 'debug' = 'basic';

    /**
     * Creates logger instance bound to plugin.
     * 
     * @param plugin - Parent plugin instance for settings access
     */
    constructor(plugin: SevenTVPlugin) {
        this.plugin = plugin;
    }

    /**
     * Main logging method with level-based filtering.
     * 
     * @param message - Text to output to console
     * @param level - Minimum verbosity level required for output
     */
    log(message: string, level: 'none' | 'basic' | 'verbose' | 'debug' = 'basic'): void {
        const currentLevel = this.getLogLevel();
        
        // Map levels to numeric values for comparison
        const levelValues = {
            'none': 0,
            'basic': 1,
            'verbose': 2,
            'debug': 3
        };
        
        const currentValue = levelValues[currentLevel as keyof typeof levelValues] || 0;
        const messageValue = levelValues[level] || 0;
        
        // Only log if current level is equal or higher than message level
        // AND current level is not 'none' (0)
        if (currentValue >= messageValue && currentValue > 0) {
            console.log(`[7TV] ${message}`);
        }
    }

    /**
     * Safely retrieves current log level with fallback handling.
     * 
     * @returns Current log level or default if settings unavailable
     */
    private getLogLevel(): string {
        try {
            if (!this.plugin || !this.plugin.settings) {
                return this.defaultLogLevel;
            }
            return this.plugin.settings.logLevel || this.defaultLogLevel;
        } catch (error) {
            return this.defaultLogLevel;
        }
    }

    /**
     * Wraps async operations with performance timing when debug logging enabled.
     * 
     * @param operation - Descriptive name of operation being timed
     * @param callback - Async function to execute and time
     * @returns Promise resolving to callback result
     */
    async withTiming<T>(operation: string, callback: () => Promise<T>): Promise<T> {
        const currentLevel = this.getLogLevel();
        if (currentLevel === 'debug') {
            const startTime = performance.now();
            try {
                const result = await callback();
                const duration = performance.now() - startTime;
                this.log(`${operation} completed in ${duration.toFixed(1)}ms`, 'debug');
                return result;
            } catch (error) {
                const duration = performance.now() - startTime;
                this.log(`${operation} failed after ${duration.toFixed(1)}ms: ${error}`, 'debug');
                throw error;
            }
        } else {
            return callback();
        }
    }

    /**
     * Outputs warning messages unless logging is disabled.
     * 
     * @param message - Warning text to display
     */
    warn(message: string): void {
        const currentLevel = this.getLogLevel();
        if (currentLevel !== 'none') {
            console.warn(`[7TV] ${message}`);
        }
    }

    /**
     * Outputs error messages unless logging is disabled.
     * 
     * @param message - Error text to display
     */
    error(message: string): void {
        const currentLevel = this.getLogLevel();
        if (currentLevel !== 'none') {
            console.error(`[7TV] ${message}`);
        }
    }
}

// =====================================================================
// MAIN PLUGIN CLASS
// =====================================================================

/**
 * Core plugin class managing 7TV emote integration lifecycle.
 * 
 * Handles settings persistence, emote fetching, caching strategies,
 * and editor integration.
 */
export default class SevenTVPlugin extends Plugin {
    /** Plugin configuration settings */
    settings: SevenTVSettings;
    
    /** Emote suggestion engine for editor integration */
    private emoteSuggest: EmoteSuggest;
    
    /** Directory path for cached emote images */
    private readonly CACHE_DIR = '_7tv-emotes-cache';
    
    /** Active download operation promise for cancellation support */
    private activeDownloadPromise: Promise<void> | null = null;
    
    /** Logger instance for plugin operations */
    private logger: PluginLogger;
    
    /** Progress tracker for batch downloads */
    private downloadTracker: DownloadProgressTracker;
    
    /** Flag indicating pre-cache operation completion */
    private preCacheComplete: boolean = false;
    
    /** Abort controller for active download operations */
    private abortController: AbortController | null = null;

    /**
     * Loads streamers from the streamers.json file in the plugin directory.
     * 
     * @returns Array of streamer objects or empty array if file not found/invalid
     */
    private async loadStreamersFromJson(): Promise<Array<{displayName: string, twitchId: string, internalKey: string}>> {
        try {
            const streamersPath = this.manifest.dir + '/streamers.json';
            const exists = await this.app.vault.adapter.exists(streamersPath);
            
            if (!exists) {
                this.logger.log('streamers.json not found in plugin directory', 'verbose');
                return [];
            }
            
            const content = await this.app.vault.adapter.read(streamersPath);
            const data = JSON.parse(content);
            
            if (data && Array.isArray(data.streamers)) {
                this.logger.log(`Loaded ${data.streamers.length} streamers from streamers.json`, 'basic');
                return data.streamers;
            } else if (Array.isArray(data)) {
                // If the JSON is just an array
                this.logger.log(`Loaded ${data.length} streamers from JSON array`, 'basic');
                return data.map((item: any) => ({
                    displayName: item.displayName || item[0] || '',
                    twitchId: item.twitchId || item[1] || '',
                    internalKey: item.internalKey || item[2] || ''
                }));
            }
            
            this.logger.log('Invalid streamers.json format', 'verbose');
            return [];
        } catch (error) {
            this.logger.error(`Failed to load streamers.json: ${error}`);
            return [];
        }
    }

    /**
     * Gets the streamer display name map for O(1) access performance.
     * 
     * @returns Map of internal keys to display names
     */
    public getStreamerDisplayMap(): Map<string, string> {
        if (this.settings.builtInStreamers && this.settings.builtInStreamers.length > 0) {
            return new Map(this.settings.builtInStreamers.map(s => [s.internalKey, s.displayName]));
        }
        return new Map();
    }

    /**
     * Gets the streamer Twitch ID map for O(1) access performance.
     * 
     * @returns Map of internal keys to Twitch IDs
     */
    public getStreamerIdMap(): Map<string, string> {
        if (this.settings.builtInStreamers && this.settings.builtInStreamers.length > 0) {
            return new Map(this.settings.builtInStreamers.map(s => [s.internalKey, s.twitchId]));
        }
        return new Map();
    }

    /**
     * Gets the streamer array in the old format for backward compatibility.
     * 
     * @returns Array of [displayName, twitchId, internalKey] tuples
     */
    private getStreamerArray(): Array<[string, string, string]> {
        if (this.settings.builtInStreamers && this.settings.builtInStreamers.length > 0) {
            return this.settings.builtInStreamers.map(s => [s.displayName, s.twitchId, s.internalKey]);
        }
        return [];
    }

    /**
     * Resolves active Twitch ID based on configuration priority.
     * Manual Twitch ID overrides built-in streamer selection.
     * 
     * @returns Active Twitch ID string or null if unconfigured
     */
    getActiveTwitchId(): string | null {
        if (this.settings.twitchUserId.trim()) {
            return this.settings.twitchUserId.trim();
        }
        if (this.settings.selectedStreamerId) {
            const twitchId = this.getStreamerIdMap().get(this.settings.selectedStreamerId);
            return twitchId || null;
        }
        return null;
    }

    /**
     * Provides public access to cache directory path.
     * 
     * @returns Path to emote cache directory within vault
     */
    getCacheDir(): string {
        return this.CACHE_DIR;
    }

    /**
     * Gets the current emote count from the suggestion engine.
     * 
     * @returns Number of loaded emotes, or 0 if not initialized
     */
    getEmoteCount(): number {
        return this.emoteSuggest ? this.emoteSuggest.getEmoteCount() : 0;
    }

    /**
     * Gets the current emote map from the suggestion engine.
     * 
     * @returns Map of emote names to IDs, or empty map if not initialized
     */
    getEmoteMap(): Map<string, string> {
        return this.emoteSuggest ? this.emoteSuggest.getEmoteMap() : new Map();
    }

    /**
     * Public logging method to allow external classes to log messages.
     * 
     * @param message - Message to log
     * @param level - Log level for the message
     */
    logMessage(message: string, level: 'basic' | 'verbose' | 'debug' = 'basic'): void {
        if (this.logger) {
            this.logger.log(message, level);
        } else {
            // Fallback if logger not initialized yet
            console.log(`[7TV] ${message}`);
        }
    }

    /**
     * Public method to reset pre-cache completion status.
     */
    resetPreCacheStatus(): void {
        this.preCacheComplete = false;
    }

    /**
     * Public method to check if pre-cache is complete.
     * 
     * @returns True if pre-cache operation has completed
     */
    isPreCacheComplete(): boolean {
        return this.preCacheComplete;
    }

    /**
     * Plugin initialization lifecycle method.
     * 
     * Loads settings, injects CSS, initializes cache, registers editor
     * suggestions, and loads any pre-configured emote sets.
     */
    async onload() {
        await this.loadSettings();

        // Only use console.time if debug logging is enabled
        if (this.settings.logLevel === 'debug') {
            console.time('[7TV] Plugin initialization');
        }
        
        // Only log timing if debug is enabled
        if (this.settings.logLevel === 'debug') {
            console.timeLog('[7TV] Plugin initialization', 'Settings loaded');
        }
        
        this.logger = new PluginLogger(this);
        this.logger.log('Plugin initialization started', 'basic');
        
        this.downloadTracker = new DownloadProgressTracker(this);
        
        // Load streamers from JSON file if not already loaded
        if (!this.settings.builtInStreamers || this.settings.builtInStreamers.length === 0) {
            const streamersFromJson = await this.loadStreamersFromJson();
            if (streamersFromJson.length > 0) {
                this.settings.builtInStreamers = streamersFromJson;
                await this.saveSettings();
                this.logger.log(`Loaded ${streamersFromJson.length} streamers from JSON file`, 'basic');
            }
        } else {
            this.logger.log(`Using ${this.settings.builtInStreamers.length} streamers from settings`, 'verbose');
        }
        
        if (this.settings.logLevel === 'debug') {
            console.timeLog('[7TV] Plugin initialization', 'CSS injected');
        }
        
        if (this.settings.cacheStrategy !== 'no-cache') {
            await this.initializeCache();
            this.logger.log(`Cache initialized (strategy: ${this.settings.cacheStrategy})`, 'verbose');
            
            if (this.settings.logLevel === 'debug') {
                console.timeLog('[7TV] Plugin initialization', 'Cache initialized');
            }
        }
        
        this.emoteSuggest = new EmoteSuggest(this.app, this);
        this.registerEditorSuggest(this.emoteSuggest);
        this.logger.log('Emote suggest registered', 'verbose');
        
        if (this.settings.logLevel === 'debug') {
            console.timeLog('[7TV] Plugin initialization', 'Emote suggest registered');
        }
        
        const activeId = this.getActiveTwitchId();
        if (activeId) {
            this.logger.log(`Loading emotes for ID: ${activeId}`, 'basic');
            
            if (this.settings.logLevel === 'debug') {
                console.timeLog('[7TV] Plugin initialization', `Loading emotes for ID: ${activeId}`);
            }
            
            await this.refreshEmotesForUser(activeId);
        }
        
        this.addCommand({
            id: 'cancel-pre-cache',
            name: 'Cancel active pre-cache download',
            callback: () => {
                if (this.abortController) {
                    this.abortController.abort();
                    new Notice('Pre-cache cancelled');
                    this.logger.log('Pre-cache cancelled via command', 'basic');
                } else {
                    new Notice('No active pre-cache to cancel');
                }
            }
        });
        
        this.addSettingTab(new EnhancedSettingTab(this.app, this));
        
        // Only end timing if debug is enabled
        if (this.settings.logLevel === 'debug') {
            console.timeEnd('[7TV] Plugin initialization');
        }
        
        this.logger.log('Plugin loaded successfully', 'basic');
    }

    /**
     * Plugin cleanup lifecycle method.
     * 
     * Ensures resources are properly released and active operations
     * are terminated to prevent memory leaks.
     */
    onunload() {
        if (this.activeDownloadPromise) {
            this.logger.log('Active download operation cancelled on unload', 'verbose');
        }
        
        if (this.abortController) {
            this.abortController.abort();
        }

        if (this.downloadTracker) {
            this.downloadTracker.cleanup();
        }
        
        this.downloadTracker.cleanup();
        
        this.logger.log('Plugin unloaded', 'basic');
    }

    /**
     * Fetches and caches emotes for specified Twitch user.
     * 
     * Updates emote suggester and applies configured cache strategy.
     * 
     * @param twitchId - Numeric Twitch user identifier
     */
    async refreshEmotesForUser(twitchId: string): Promise<void> {
        this.logger.log(`Fetching emotes for Twitch ID: ${twitchId}`, 'basic');
        const newEmoteMap = await fetchEmotesForTwitchId(twitchId);
        
        if (newEmoteMap.size <= 2) {
            throw new Error(`Only found ${newEmoteMap.size} emotes for user ${twitchId}. Expected more than 2 emotes.`);
        }
        
        this.emoteSuggest.updateEmoteMap(newEmoteMap);
        this.logger.log(`Loaded ${newEmoteMap.size} emotes`, 'basic');
        
        this.preCacheComplete = false;
    }

    /**
     * Routes emote insertion to appropriate method based on cache strategy.
     * 
     * @param editor - Active Obsidian editor instance
     * @param name - Emote display name
     * @param id - 7TV emote identifier
     */
    async insertEmoteByStrategy(editor: Editor, name: string, id: string): Promise<void> {
        this.logger.log(`Inserting emote "${name}" (${id}) with ${this.settings.cacheStrategy} strategy`, 'verbose');
        
        switch (this.settings.cacheStrategy) {
            case 'no-cache':
                await this.insertWithoutCache(editor, name, id);
                break;
            case 'on-demand':
                await this.insertWithOnDemandCache(editor, name, id);
                break;
        }
    }

    /**
     * Inserts emote using direct CDN URL without local caching.
     * 
     * @param editor - Active Obsidian editor instance
     * @param name - Emote display name
     * @param id - 7TV emote identifier
     */
    private async insertWithoutCache(editor: Editor, name: string, id: string): Promise<void> {
        // Create the HTML structure using DOM API
        const span = document.createElement('span');
        span.className = 'seven-tv-emote';
        span.setAttribute('title', `:${name}:`);
        
        const img = document.createElement('img');
        img.setAttribute('src', `https://cdn.7tv.app/emote/${id}/1x.webp`);
        img.setAttribute('alt', name);
        img.setAttribute('style', 'display:inline-block;height:1.5em;vertical-align:middle;');
        
        span.appendChild(img);
        
        this.logger.log(`Emote "${name}" (${id}) inserted via CDN (no-cache strategy)`, 'debug');
        editor.replaceSelection(span.outerHTML);
    }

    /**
     * Inserts emote using local cache when available, otherwise falls back to 7TV CDN.
     * Automatically caches emotes in the background on first use for future access.
     * 
     * @param editor - Active Obsidian editor instance where emote should be inserted
     * @param name - Display name of the emote for alt text and title attributes
     * @param id - 7TV emote identifier used for cache lookup and CDN URL construction
     */
    private async insertWithOnDemandCache(editor: Editor, name: string, id: string): Promise<void> {
        const cacheFileName = `${id}.webp`;
        const cacheRelativePath = `${this.CACHE_DIR}/${cacheFileName}`;
        const cdnUrl = `https://cdn.7tv.app/emote/${id}/1x.webp`;

        // Create picture element using DOM API
        const picture = document.createElement('picture');
        picture.className = 'seven-tv-emote';
        
        const source1 = document.createElement('source');
        source1.setAttribute('srcset', cdnUrl);
        source1.setAttribute('type', 'image/webp');
        
        const source2 = document.createElement('source');
        source2.setAttribute('srcset', cacheRelativePath);
        source2.setAttribute('type', 'image/webp');
        
        const img = document.createElement('img');
        img.setAttribute('src', cacheRelativePath);
        img.setAttribute('alt', `:${name}:`);
        img.setAttribute('title', `:${name}:`);
        img.setAttribute('style', 'height:1.5em;vertical-align:middle');
        
        // Build the DOM tree
        picture.appendChild(source1);
        picture.appendChild(source2);
        picture.appendChild(img);
        
        // Insert the emote into the editor
        editor.replaceSelection(picture.outerHTML);

        // Check if we need to download the file to cache
        if (!(await this.app.vault.adapter.exists(cacheRelativePath))) {
            // Delay the cache download to let the CDN load first
            window.setTimeout(() => {
                this.downloadToCache(id, cdnUrl, cacheRelativePath).catch(() => {
                    // Ignore errors
                });
            }, 500); // <- Delay
        }
    }

        /**
     * Creates cache directory in vault if it doesn't exist.
     */
    private async initializeCache(): Promise<void> {
        try {
            if (!(await this.app.vault.adapter.exists(this.CACHE_DIR))) {
                await this.app.vault.createFolder(this.CACHE_DIR);
                this.logger.log(`Cache directory created: ${this.CACHE_DIR}`, 'verbose');
            } else {
                this.logger.log(`Cache directory already exists: ${this.CACHE_DIR}`, 'debug');
            }
        } catch (error) {
            this.logger.error(`Cache initialization error: ${error}`);
        }
    }

    /**
     * Public method to ensure cache is initialized when needed.
     */
    public async ensureCacheInitialized(): Promise<void> {
        if (this.settings.cacheStrategy !== 'no-cache') {
            await this.initializeCache();
        }
    }

    /**
     * Checks if any emotes have been loaded.
     * 
     * @returns Boolean indicating if emotes are loaded
     */
    public hasLoadedEmotes(): boolean {
        return this.getEmoteCount() > 0;
    }

    /**
     * Manually triggers pre-cache for all loaded emotes.
     * 
     * @returns Promise resolving when pre-cache completes
     */
    public async triggerPreCache(): Promise<void> {
        const emoteMap = this.getEmoteMap();
        if (!emoteMap || emoteMap.size === 0) {
            throw new Error('No emotes loaded to cache');
        }
        
        this.logger.log('Starting manual pre-cache operation', 'basic');
        
        if (this.abortController) {
            this.abortController.abort();
        }
        
        this.abortController = new AbortController();
        
        this.activeDownloadPromise = this.preCacheEmoteSet(emoteMap);
        this.activeDownloadPromise
            .then(() => {
                this.preCacheComplete = true;
                this.logger.log('Pre-cache completed', 'basic');
            })
            .catch(err => {
                if (err.name === 'AbortError') {
                    this.logger.log('Pre-cache cancelled', 'basic');
                } else {
                    this.logger.warn(`Pre-cache errors: ${err}`);
                }
            })
            .finally(() => { 
                this.activeDownloadPromise = null;
                this.abortController = null;
            });
    }

    /**
     * Pre-caches all emotes in a set using batched downloads with progress tracking.
     * 
     * @param emoteMap - Map of emote names to 7TV IDs
     */
    private async preCacheEmoteSet(emoteMap: Map<string, string>): Promise<void> {
        const emoteIds = Array.from(emoteMap.values());
        const totalEmotes = emoteIds.length;
        
        this.logger.log(`Starting pre-cache of ${totalEmotes} emotes`, 'basic');
        
        // FIX: Updated from 5KB to 50KB for more accurate 7TV emote size estimation
        const estimatedAverageSize = 50 * 1024; // 50KB - average for 7TV WebP emotes
        const estimatedTotalBytes = totalEmotes * estimatedAverageSize;
        
        this.downloadTracker.start(totalEmotes, () => {
            if (this.abortController) {
                this.abortController.abort();
            }
        });
        
        this.downloadTracker.setTotalBytes(estimatedTotalBytes);
        
        const BATCH_SIZE = 3;
        const totalBatches = Math.ceil(totalEmotes / BATCH_SIZE);
        
        try {
            for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
                if (this.abortController?.signal.aborted || this.downloadTracker.isCancelledRequested()) {
                    throw new DOMException('Download cancelled', 'AbortError');
                }
                
                const startIdx = batchIndex * BATCH_SIZE;
                const endIdx = Math.min(startIdx + BATCH_SIZE, totalEmotes);
                const batch = emoteIds.slice(startIdx, endIdx);
                
                this.downloadTracker.updateBatch(batchIndex + 1);
                
                const promises = batch.map(id => 
                    this.ensureEmoteCached(id)
                        .then(bytes => this.downloadTracker.recordSuccess(bytes))
                        .catch(() => this.downloadTracker.recordFailure())
                );
                
                await Promise.allSettled(promises);
                
                await new Promise(resolve => {
                    window.setTimeout(resolve, 100);
                });
                
                if (batchIndex % Math.max(1, Math.floor(totalBatches * 0.1)) === 0 || batchIndex % 5 === 0) {
                    const percent = Math.round((startIdx / totalEmotes) * 100);
                    this.logger.log(`Pre-cache progress: ${startIdx}/${totalEmotes} (${percent}%)`, 'verbose');
                }
            }
            
            this.downloadTracker.complete();
            this.logger.log('Pre-cache completed', 'basic');
            
        } catch (error) {
            if (error.name === 'AbortError') {
                this.logger.log('Pre-cache was cancelled', 'basic');
            } else {
                this.logger.error(`Pre-cache failed: ${error}`);
                throw error;
            }
        }
    }

    /**
     * Ensures a specific emote is cached locally.
     * 
     * @param emoteId - 7TV emote identifier
     * @returns Number of bytes downloaded, or 0 if already cached
     */
    private async ensureEmoteCached(emoteId: string): Promise<number> {
        const cachePath = `${this.CACHE_DIR}/${emoteId}.webp`;
        if (await this.app.vault.adapter.exists(cachePath)) {
            this.logger.log(`Emote ${emoteId} already cached`, 'debug');
            return 0;
        }
        
        const cdnUrl = `https://cdn.7tv.app/emote/${emoteId}/1x.webp`;
        return await this.downloadToCache(emoteId, cdnUrl, cachePath);
    }

    /**
     * Downloads emote from 7TV CDN and saves to local cache.
     * 
     * @param emoteId - 7TV emote identifier for logging
     * @param sourceUrl - CDN source URL
     * @param destPath - Local destination path
     * @returns Number of bytes downloaded
     */
    private async downloadToCache(emoteId: string, sourceUrl: string, destPath: string): Promise<number> {
        try {
            this.logger.log(`Downloading emote ${emoteId} to cache...`, 'verbose');
            
            const response = await fetch(sourceUrl, {
                signal: this.abortController?.signal
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const arrayBuffer = await response.arrayBuffer();
            const bytes = arrayBuffer.byteLength;
            
            await this.app.vault.adapter.writeBinary(destPath, arrayBuffer);
            
            const fileSize = (bytes / 1024).toFixed(1);
            this.logger.log(`Cached emote ${emoteId} (${fileSize} KB) at ${destPath}`, 'debug');
            
            return bytes;
        } catch (error) {
            if (error.name === 'AbortError') {
                throw error;
            }
            this.logger.warn(`Cache download failed for ${emoteId}: ${error}`);
            throw error;
        }
    }

    /**
     * Cancels active pre-cache operation.
     */
    public cancelPreCache(): void {
        if (this.abortController) {
            this.abortController.abort();
            this.logger.log('Pre-cache cancelled', 'basic');
        }
    }

    /**
     * Checks if pre-cache is currently in progress.
     * 
     * @returns Boolean indicating if pre-cache is active
     */
    public isPreCaching(): boolean {
        return this.activeDownloadPromise !== null;
    }

    /**
     * Loads plugin settings from Obsidian's persistent storage.
     */
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    /**
     * Saves plugin settings to Obsidian's persistent storage.
     */
    async saveSettings() {
        await this.saveData(this.settings);
    }
    
}

// =====================================================================
// EMOTE AUTO-COMPLETE ENGINE
// =====================================================================

/**
 * Provides emote suggestions in the editor triggered by colon character.
 * 
 * Integrates with Obsidian's EditorSuggest API for seamless auto-completion
 * with visual emote previews.
 */
class EmoteSuggest extends EditorSuggest<string> {
    /** Internal mapping of emote names to 7TV IDs */
    private emoteMap: Map<string, string> = new Map();
    
    /** Reference to main plugin instance */
    private plugin: SevenTVPlugin;

    /**
     * Creates emote suggestion engine.
     * 
     * @param app - Obsidian application instance
     * @param plugin - Parent plugin instance
     */
    constructor(app: App, plugin: SevenTVPlugin) {
        super(app);
        this.plugin = plugin;
    }

    /**
     * Updates internal emote map with new data.
     * 
     * @param newMap - Updated map of emote names to 7TV IDs
     */
    updateEmoteMap(newMap: Map<string, string>): void {
        this.emoteMap = new Map(newMap);
        this.plugin.logMessage(`Emote map updated with ${newMap.size} emotes`, 'verbose');
    }

    /**
     * Gets the current emote map for external access.
     * 
     * @returns Current emote name to ID mapping
     */
    getEmoteMap(): Map<string, string> {
        return this.emoteMap;
    }

    /**
     * Determines when to trigger suggestion popup based on typed text.
     * 
     * @param cursor - Current cursor position in editor
     * @param editor - Active editor instance
     * @returns Trigger information or null if no trigger detected
     */
    onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {
        const line = editor.getLine(cursor.line);
        const sub = line.substring(0, cursor.ch);
        const match = sub.match(/:([a-zA-Z0-9_]+):?$/);
        
        if (match) {
            const fullMatch = match[0];
            const query = match[1];
            const startPos = cursor.ch - fullMatch.length;
            
            this.plugin.logMessage(`Emote search triggered: "${query}"`, 'verbose');
            
            return {
                start: { line: cursor.line, ch: Math.max(0, startPos) },
                end: cursor,
                query: query
            };
        }
        return null;
    }

    /**
     * Generates suggestions based on current query.
     * 
     * @param context - Suggestion context containing query text
     * @returns Array of emote names matching the query
     */
    getSuggestions(context: EditorSuggestContext): string[] {
        const query = context.query.toLowerCase();
        const matches = Array.from(this.emoteMap.keys())
            .filter(name => name.toLowerCase().includes(query))
            .slice(0, 25);
        
        this.plugin.logMessage(`Found ${matches.length} emotes matching "${context.query}"`, 'verbose');
        
        return matches;
    }

    /**
     * Renders individual suggestion with emote image and name.
     * 
     * @param value - Emote name to render
     * @param el - HTML element to populate with suggestion content
     */
    renderSuggestion(value: string, el: HTMLElement): void {
        el.empty();
        const container = el.createDiv();
        container.addClass('seven-tv-suggestion-item');
        
        const emoteId = this.emoteMap.get(value);
        if (emoteId) {
            const cdnUrl = `https://cdn.7tv.app/emote/${emoteId}/1x.webp`;
            
            const imgEl = container.createEl('img');
            imgEl.setAttribute('src', cdnUrl);
            imgEl.setAttribute('alt', value);
            imgEl.addClass('seven-tv-suggestion-img');
            imgEl.setAttribute('data-emote-name', value);
        }
        
        const textSpan = container.createEl('span');
        textSpan.setText(`:${value}:`);
        textSpan.addClass('seven-tv-suggestion-text');
    }

    /**
     * Handles suggestion selection and inserts emote into editor.
     * 
     * @param value - Selected emote name
     * @param evt - Mouse or keyboard event that triggered selection
     */
    selectSuggestion(value: string, evt: MouseEvent | KeyboardEvent): void {
        if (!this.context || !this.context.editor) return;
        
        const editor = this.context.editor;
        const emoteId = this.emoteMap.get(value);
        if (!emoteId) return;
        
        this.plugin.logMessage(`Selected emote: "${value}" (ID: ${emoteId})`, 'verbose');
        
        const typedRange = editor.getRange(this.context.start, this.context.end);
        const hasTrailingColon = typedRange.endsWith(':');
        let deleteEnd = this.context.end;
        
        if (hasTrailingColon && this.context.end.ch > this.context.start.ch) {
            deleteEnd = { ...this.context.end };
        }
        
        editor.replaceRange('', this.context.start, deleteEnd);
        this.plugin.insertEmoteByStrategy(editor, value, emoteId);
    }

    /**
     * Returns count of loaded emotes.
     * 
     * @returns Number of emotes in the current map
     */
    getEmoteCount(): number {
        return this.emoteMap.size;
    }
}

// =====================================================================
// ENHANCED SETTINGS TAB
// =====================================================================

/**
 * Comprehensive settings interface with improved UX organization.
 * 
 * Features streamlined cache strategy selection with immediate visual feedback,
 * detailed status display, and clear separation between primary and advanced configuration.
 */
class EnhancedSettingTab extends PluginSettingTab {
    /** Reference to main plugin instance */
    plugin: SevenTVPlugin;
    
    /** Debounce timer for manual ID input */
    private debounceTimer: number | null = null;
    
    /** Flag preventing concurrent display calls */
    private isDisplaying: boolean = false;
    
    /** Status display element reference */
    private statusDiv: HTMLElement | null = null;
    
    /** Animation frame request ID for rendering coordination */
    private renderRequestId: number | null = null;
    
    /** Cache statistics for display */
    private cacheStats: { count: number; size: number } = { count: 0, size: 0 };
    
    /** UI element references for immediate updates */
    private onDemandRadio: HTMLElement | null = null;
    private noCacheRadio: HTMLElement | null = null;
    private preCacheButton: HTMLButtonElement | null = null;
    private cancelPreCacheButton: HTMLButtonElement | null = null;
    private clearCacheButton: HTMLButtonElement | null = null;

    /**
     * Creates settings tab instance.
     * 
     * @param app - Obsidian application instance
     * @param plugin - Parent plugin instance
     */
    constructor(app: App, plugin: SevenTVPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    /**
     * Renders the settings tab interface with organized sections.
     * 
     * Prevents concurrent display calls and includes safety checks
     * for rendering during Obsidian's measure cycles.
     */
    async display(): Promise<void> {
        if (this.isDisplaying) {
            this.plugin.logMessage('Settings tab display already in progress, cancelling duplicate', 'debug');
            return;
        }
        
        if (this.renderRequestId !== null) {
            cancelAnimationFrame(this.renderRequestId);
            this.renderRequestId = null;
        }
        
        this.isDisplaying = true;
        
        // Only log timing if debug is enabled
        if (this.plugin.settings.logLevel === 'debug') {
            console.time('[7TV] Settings render');
        }
        
        const { containerEl } = this;
        containerEl.empty();
        
        this.renderRequestId = requestAnimationFrame(async () => {
            try {
                containerEl.createEl('p', { 
                    text: 'Integrate 7TV (Twitch) emotes into your notes with auto-complete suggestions.',
                    cls: 'setting-item-description'
                });

                new Setting(containerEl).setName('Streamer selection').setHeading();
                containerEl.createEl('p', { 
                    text: 'Choose from popular streamers or enter a Twitch ID directly.',
                    cls: 'setting-item-description'
                });
                
                const streamerSetting = new Setting(containerEl)
                    .setName('Select streamer')
                    .setDesc('Streamer emotes will be available for auto-complete');
                
                const buttonContainer = streamerSetting.controlEl.createDiv();
                buttonContainer.style.display = 'flex';
                buttonContainer.style.gap = '8px';
                buttonContainer.style.alignItems = 'center';
                
                const button = buttonContainer.createEl('button');
                button.addClass('mod-cta');
                button.style.flex = '1';
                button.style.textAlign = 'left';
                button.style.overflow = 'hidden';
                button.style.textOverflow = 'ellipsis';
                button.style.whiteSpace = 'nowrap';
                
                const updateButtonText = () => {
                    const currentKey = this.plugin.settings.selectedStreamerId;
                    const displayName = this.plugin.getStreamerDisplayMap().get(currentKey);
                    button.textContent = displayName || currentKey || 'Select streamer...';
                };
                
                updateButtonText();
                
                button.addEventListener('click', () => {
                    if (this.isDisplaying) {
                        window.setTimeout(() => {
                            this.openStreamerModal(button, updateButtonText, manualInput);
                        }, 100);
                    } else {
                        this.openStreamerModal(button, updateButtonText, manualInput);
                    }
                });
                
                const manualInput = buttonContainer.createEl('input');
                manualInput.type = 'text';
                manualInput.placeholder = 'Twitch ID';
                manualInput.value = this.plugin.settings.twitchUserId;
                manualInput.style.flex = '1';
                
                manualInput.addEventListener('input', () => {
                    if (this.debounceTimer) window.clearTimeout(this.debounceTimer);
                    
                    this.debounceTimer = window.setTimeout(async () => {
                        const value = manualInput.value.trim();
                        this.plugin.settings.twitchUserId = value;
                        
                        if (value && this.plugin.settings.selectedStreamerId) {
                            this.plugin.settings.selectedStreamerId = '';
                            updateButtonText();
                        }
                        
                        await this.plugin.saveSettings();
                        
                        if (/^\d{6,}$/.test(value)) {
                            this.plugin.logMessage(`Auto-fetching emotes for manual ID: ${value}`, 'verbose');
                            try {
                                await this.plugin.refreshEmotesForUser(value);
                                await this.updateStatus();
                                new Notice('Emotes loaded');
                            } catch (error) {
                                this.plugin.logMessage(`Failed to load emotes: ${error}`, 'verbose');
                                new Notice('Failed to load emotes');
                            }
                        }
                    }, 800);
                });
                
                if (this.plugin.settings.selectedStreamerId || this.plugin.settings.twitchUserId) {
                    const clearButton = streamerSetting.controlEl.createEl('button');
                    clearButton.textContent = 'Clear';
                    clearButton.style.marginLeft = '8px';
                    clearButton.addEventListener('click', async () => {
                        this.plugin.settings.selectedStreamerId = '';
                        this.plugin.settings.twitchUserId = '';
                        await this.plugin.saveSettings();
                        updateButtonText();
                        manualInput.value = '';
                        new Notice('Selection cleared');
                        this.plugin.logMessage('Streamer selection cleared', 'verbose');
                        await this.updateStatus();
                    });
                }

                new Setting(containerEl).setName('Cache').setHeading();
                containerEl.createEl('p', { 
                    text: 'Control how emote images are stored on your device.',
                    cls: 'setting-item-description'
                });

                const cacheContainer = containerEl.createDiv();
                cacheContainer.style.marginBottom = '16px';
                
                const onDemandOption = cacheContainer.createDiv();
                onDemandOption.style.display = 'flex';
                onDemandOption.style.alignItems = 'flex-start';
                onDemandOption.style.marginBottom = '12px';
                onDemandOption.style.cursor = 'pointer';
                
                this.onDemandRadio = onDemandOption.createDiv();
                this.onDemandRadio.style.cssText = `
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    border: 2px solid var(--text-muted);
                    margin-right: 10px;
                    margin-top: 2px;
                    flex-shrink: 0;
                    background: ${this.plugin.settings.cacheStrategy === 'on-demand' ? 'var(--interactive-accent)' : 'transparent'};
                    border-color: ${this.plugin.settings.cacheStrategy === 'on-demand' ? 'var(--interactive-accent)' : 'var(--text-muted)'};
                    transition: background-color 0.2s ease, border-color 0.2s ease;
                `;
                
                const onDemandContent = onDemandOption.createDiv();
                onDemandContent.createEl('div', { 
                    text: 'On-demand cache (recommended)',
                    attr: { style: 'font-weight: 600; margin-bottom: 2px;' }
                });
                onDemandContent.createEl('div', { 
                    text: 'Caches emotes when you first use them. Best balance of speed and storage.',
                    attr: { style: 'font-size: 0.9em; color: var(--text-muted); line-height: 1.4;' }
                });
                
                onDemandOption.addEventListener('click', async () => {
                    if (this.plugin.settings.cacheStrategy !== 'on-demand') {
                        this.plugin.settings.cacheStrategy = 'on-demand';
                        await this.plugin.saveSettings();
                        await this.plugin.ensureCacheInitialized();
                        this.updateRadioButtons();
                        this.updateActionButtons();
                        new Notice('Switched to On-Demand Cache');
                    }
                });
                
                const noCacheOption = cacheContainer.createDiv();
                noCacheOption.style.display = 'flex';
                noCacheOption.style.alignItems = 'flex-start';
                noCacheOption.style.marginBottom = '16px';
                noCacheOption.style.cursor = 'pointer';
                
                this.noCacheRadio = noCacheOption.createDiv();
                this.noCacheRadio.style.cssText = `
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    border: 2px solid var(--text-muted);
                    margin-right: 10px;
                    margin-top: 2px;
                    flex-shrink: 0;
                    background: ${this.plugin.settings.cacheStrategy === 'no-cache' ? 'var(--interactive-accent)' : 'transparent'};
                    border-color: ${this.plugin.settings.cacheStrategy === 'no-cache' ? 'var(--interactive-accent)' : 'var(--text-muted)'};
                    transition: background-color 0.2s ease, border-color 0.2s ease;
                `;
                
                const noCacheContent = noCacheOption.createDiv();
                noCacheContent.createEl('div', { 
                    text: 'No cache',
                    attr: { style: 'font-weight: 600; margin-bottom: 2px;' }
                });
                noCacheContent.createEl('div', { 
                    text: 'Always uses CDN links. No local storage, but requires internet connection.',
                    attr: { style: 'font-size: 0.9em; color: var(--text-muted); line-height: 1.4;' }
                });
                
                noCacheOption.addEventListener('click', async () => {
                    if (this.plugin.settings.cacheStrategy !== 'no-cache') {
                        this.plugin.settings.cacheStrategy = 'no-cache';
                        await this.plugin.saveSettings();
                        this.updateRadioButtons();
                        this.updateActionButtons();
                        new Notice('Switched to No Cache mode');
                    }
                });
                
                const actionContainer = containerEl.createDiv();
                actionContainer.style.display = 'grid';
                actionContainer.style.gridTemplateColumns = '1fr 1fr';
                actionContainer.style.gap = '8px';
                actionContainer.style.marginTop = '8px';
                actionContainer.style.marginBottom = '24px';

                this.preCacheButton = actionContainer.createEl('button');
                this.preCacheButton.textContent = 'Pre-cache now';
                this.preCacheButton.style.flex = '1';
                
                this.preCacheButton.addEventListener('click', async () => {
                    if (!this.plugin.hasLoadedEmotes()) {
                        new Notice('No emotes loaded to cache');
                        return;
                    }
                    
                    const emoteCount = this.plugin.getEmoteCount();
                    // FIX: Use more accurate size estimation (50KB per emote)
                    const estimatedSizeMB = ((emoteCount * 50) / 1024).toFixed(1);
                    
                    const confirmMsg = `This will download all ${emoteCount} emotes (est. ${estimatedSizeMB}MB).\n\nThis may take a while. Continue?`;
                    
                    new SimpleConfirmationModal(
                        this.app, 
                        confirmMsg, 
                        async () => {
                            /**
                             * Pre-cache initialization handler.
                             * 
                             * Triggers background download operation with progress tracking.
                             * Updates UI state to reflect ongoing operation and provides cancellation capability.
                             */
                            new Notice('Starting pre-cache...');
                            try {
                                await this.plugin.triggerPreCache();
                                await this.updateStatus();
                            } catch (error) {
                                new Notice(`Failed to start pre-cache: ${error.message}`);
                            }
                        }
                    ).open();
                });

                this.cancelPreCacheButton = actionContainer.createEl('button');
                this.cancelPreCacheButton.textContent = 'Cancel pre-cache';
                this.cancelPreCacheButton.className = 'mod-warning';
                
                this.cancelPreCacheButton.addEventListener('click', async () => {
                    if (this.plugin.isPreCaching()) {
                        this.plugin.cancelPreCache();
                        new Notice('Pre-cache cancelled');
                        this.updateActionButtons();
                        await this.updateStatus();
                    }
                });

                this.clearCacheButton = containerEl.createEl('button');
                this.clearCacheButton.textContent = 'Clear cache';
                this.clearCacheButton.style.width = '100%';
                this.clearCacheButton.style.marginTop = '8px';
                this.clearCacheButton.style.marginBottom = '24px';
                
                this.clearCacheButton.addEventListener('click', async () => {
                    const warningMsg = `⚠️ Warning: Clearing the cache may cause emotes to not display correctly if:

                    • The original CDN links change or break
                    • You're offline and emotes aren't cached
                    • You switch to "No Cache" mode later

                    Are you sure you want to clear the cache?`;
                    
                    new SimpleConfirmationModal(
                        this.app, 
                        warningMsg, 
                        async () => {
                            /**
                             * Confirmation handler: Executes cache purge operation.
                             * 
                             * Performs recursive directory removal with error boundary protection.
                             * Resets pre-cache state and updates UI to reflect cleared state.
                             */
                            try {
                                const cacheDir = this.plugin.getCacheDir();
                                if (await this.plugin.app.vault.adapter.exists(cacheDir)) {
                                    await this.plugin.app.vault.adapter.rmdir(cacheDir, true);
                                    await this.plugin.ensureCacheInitialized();
                                    this.plugin.resetPreCacheStatus();
                                    await this.updateStatus();
                                    this.plugin.logMessage('Cache cleared', 'verbose');
                                    new Notice('Cache cleared successfully');
                                }
                            } catch (error) {
                                new Notice('Failed to clear cache');
                                this.plugin.logMessage(`Failed to clear cache: ${error}`, 'verbose');
                            }
                        }
                    ).open();
                });

                new Setting(containerEl).setName('Status').setHeading();
                
                this.statusDiv = containerEl.createDiv();
                this.statusDiv.style.marginBottom = '24px';
                this.statusDiv.style.padding = '12px';
                this.statusDiv.style.borderRadius = '6px';
                this.statusDiv.style.backgroundColor = 'var(--background-secondary)';
                this.statusDiv.style.border = '1px solid var(--background-modifier-border)';
                this.statusDiv.style.fontSize = '0.9em';
                
                void this.updateStatus();
                this.updateRadioButtons();
                this.updateActionButtons();

                new Setting(containerEl).setName('Advanced').setHeading();
                containerEl.createEl('p', { 
                    text: 'Debugging and troubleshooting.',
                    cls: 'setting-item-description'
                });

                new Setting(containerEl)
                    .setName('Log level')
                    .setDesc('Controls console output. Only change if debugging issues.')
                    .addDropdown(dropdown => dropdown
                        .addOption('none', 'None (Quiet)')
                        .addOption('basic', 'Basic')
                        .addOption('verbose', 'Verbose')
                        .addOption('debug', 'Debug (Maximum)')
                        .setValue(this.plugin.settings.logLevel)
                        .onChange(async (value: any) => {
                            this.plugin.settings.logLevel = value;
                            await this.plugin.saveSettings();
                            this.plugin.logMessage(`Log level changed to: ${value}`, 'verbose');
                            await this.updateStatus();
                        }));
                
                if (this.plugin.settings.logLevel === 'debug') {
                    console.timeEnd('[7TV] Settings render');
                }
                
            } catch (error) {
                this.plugin.logMessage(`Error rendering settings: ${error}`, 'verbose');
            } finally {
                this.isDisplaying = false;
                this.renderRequestId = null;
            }
        });
    }

    /**
     * Updates cache statistics from file system.
     */
    private async updateCacheStats(): Promise<void> {
        if (this.plugin.settings.cacheStrategy === 'no-cache') {
            this.cacheStats = { count: 0, size: 0 };
            return;
        }
        
        try {
            const cacheDir = this.plugin.getCacheDir();
            if (await this.plugin.app.vault.adapter.exists(cacheDir)) {
                const files = await this.plugin.app.vault.adapter.list(cacheDir);
                this.cacheStats.count = files.files.length;
                
                let totalSize = 0;
                for (const file of files.files) {
                    const stats = await this.plugin.app.vault.adapter.stat(file);
                    if (stats) {
                        totalSize += stats.size;
                    }
                }
                this.cacheStats.size = totalSize;
            } else {
                this.cacheStats = { count: 0, size: 0 };
            }
        } catch (error) {
            this.plugin.logMessage(`Failed to calculate cache stats: ${error}`, 'verbose');
            this.cacheStats = { count: 0, size: 0 };
        }
    }

    /**
     * Formats byte counts to human-readable format.
     * 
     * @param bytes - Raw byte count to format
     * @returns Formatted string with appropriate unit
     */
    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Updates radio button visual states based on current cache strategy.
     */
    private updateRadioButtons(): void {
        if (!this.onDemandRadio || !this.noCacheRadio) return;
        
        const isOnDemand = this.plugin.settings.cacheStrategy === 'on-demand';
        const isNoCache = this.plugin.settings.cacheStrategy === 'no-cache';
        
        this.onDemandRadio.style.background = isOnDemand ? 'var(--interactive-accent)' : 'transparent';
        this.onDemandRadio.style.borderColor = isOnDemand ? 'var(--interactive-accent)' : 'var(--text-muted)';
        
        this.noCacheRadio.style.background = isNoCache ? 'var(--interactive-accent)' : 'transparent';
        this.noCacheRadio.style.borderColor = isNoCache ? 'var(--interactive-accent)' : 'var(--text-muted)';
    }

    /**
     * Updates action button states based on current plugin state.
     */
    private updateActionButtons(): void {
        if (!this.preCacheButton || !this.cancelPreCacheButton || !this.clearCacheButton) return;
        
        const isNoCache = this.plugin.settings.cacheStrategy === 'no-cache';
        const hasEmotes = this.plugin.hasLoadedEmotes();
        const isPreCaching = this.plugin.isPreCaching();
        
        this.preCacheButton.disabled = isNoCache || !hasEmotes;
        this.cancelPreCacheButton.disabled = !isPreCaching;
        this.clearCacheButton.disabled = isNoCache;
        
        if (this.preCacheButton.disabled) {
            this.preCacheButton.style.opacity = '0.5';
            this.preCacheButton.style.cursor = 'not-allowed';
        } else {
            this.preCacheButton.style.opacity = '1';
            this.preCacheButton.style.cursor = 'pointer';
        }
        
        if (this.cancelPreCacheButton.disabled) {
            this.cancelPreCacheButton.style.opacity = '0.5';
            this.cancelPreCacheButton.style.cursor = 'not-allowed';
        } else {
            this.cancelPreCacheButton.style.opacity = '1';
            this.cancelPreCacheButton.style.cursor = 'pointer';
        }
        
        if (this.clearCacheButton.disabled) {
            this.clearCacheButton.style.opacity = '0.5';
            this.clearCacheButton.style.cursor = 'not-allowed';
        } else {
            this.clearCacheButton.style.opacity = '1';
            this.clearCacheButton.style.cursor = 'pointer';
        }
    }

    /**
     * Updates status section with current plugin state.
     */
    private async updateStatus(): Promise<void> {
        // Store a local reference since this.statusDiv might change
        const statusDiv = this.statusDiv;
        if (!statusDiv) return;
        
        try {
            const activeId = this.plugin.getActiveTwitchId();
            const activeStreamer = this.plugin.settings.selectedStreamerId;
            const streamerName = activeStreamer ? this.plugin.getStreamerDisplayMap().get(activeStreamer) : null;
            const emoteCount = this.plugin.getEmoteCount();
            const isPreCaching = this.plugin.isPreCaching();
            const preCacheStatus = this.plugin.isPreCacheComplete() ? 'Complete' : isPreCaching ? 'In progress' : 'Not started';
            
            await this.updateCacheStats();
            
            // Clear existing content
            statusDiv.empty();
            
            // Helper function to create a status row
            const createStatusRow = (label: string, value: string) => {
                const row = statusDiv.createDiv();
                row.style.cssText = 'margin-bottom: 8px;';
                
                const strong = row.createEl('strong');
                strong.textContent = `${label}:`;
                row.createEl('br');
                
                const valueSpan = row.createSpan();
                valueSpan.textContent = value;
            };
            
            // Current source
            createStatusRow('Current source', streamerName || activeId || 'None selected');
            
            // Emotes loaded
            createStatusRow('Emotes loaded', emoteCount > 0 ? `${emoteCount} emotes` : 'None');
            
            // Cache strategy
            const cacheStrategyDisplay = this.plugin.settings.cacheStrategy === 'on-demand' ? 'On-Demand' : 'No Cache';
            createStatusRow('Cache strategy', cacheStrategyDisplay);
            
            // Cache status (only if not no-cache)
            if (this.plugin.settings.cacheStrategy !== 'no-cache') {
                createStatusRow('Cache status', `${this.cacheStats.count} emotes cached (${this.formatBytes(this.cacheStats.size)})`);
                createStatusRow('Pre-cache', preCacheStatus);
            }
            
            // Download in progress banner
            if (isPreCaching) {
                const banner = statusDiv.createDiv();
                banner.style.cssText = 'margin-top: 8px; padding: 8px; background: var(--background-modifier-success); border-radius: 4px; font-size: 0.85em;';
                
                const bannerTitle = banner.createEl('strong');
                bannerTitle.textContent = '⏳ Download in progress';
                banner.createEl('br');
                
                const bannerText = banner.createSpan();
                bannerText.textContent = 'Check top-right corner for progress';
            }
            
            this.updateActionButtons();
        } catch (error) {
            this.plugin.logMessage(`Error updating status: ${error}`, 'verbose');
        }
    }

    /**
     * Opens streamer selection modal.
     * 
     * @param button - Button element triggering the modal
     * @param updateButtonText - Callback to update button text after selection
     * @param manualInput - Manual ID input element for synchronization
     */
    private openStreamerModal(button: HTMLButtonElement, updateButtonText: () => void, manualInput: HTMLInputElement): void {
        new StreamerSuggestModal(this.app, this.plugin, async (selectedKey) => {
            const displayName = this.plugin.getStreamerDisplayMap().get(selectedKey);
            const twitchId = this.plugin.getStreamerIdMap().get(selectedKey);
            
            if (!twitchId) {
                new Notice('Invalid streamer selection');
                return;
            }
            
            this.plugin.settings.selectedStreamerId = selectedKey;
            this.plugin.settings.twitchUserId = twitchId;
            await this.plugin.saveSettings();
            
            updateButtonText();
            manualInput.value = twitchId;
            
            this.plugin.logMessage(`Selected streamer: ${displayName} (ID: ${twitchId})`, 'verbose');
            new Notice(`Fetching ${displayName}'s emotes...`);
            
            try {
                await this.plugin.refreshEmotesForUser(twitchId);
                await this.updateStatus(); 
                new Notice(`${displayName}'s emotes loaded`);
            } catch (error) {
                this.plugin.logMessage(`Failed to load emotes: ${error}`, 'verbose');
                new Notice('Failed to load emotes');
            }
        }).open();
    }
    
    /**
     * Settings tab cleanup lifecycle method.
     */
    hide(): void {
        if (this.renderRequestId !== null) {
            cancelAnimationFrame(this.renderRequestId);
            this.renderRequestId = null;
        }
        
        if (this.debounceTimer) {
            window.clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        
        this.onDemandRadio = null;
        this.noCacheRadio = null;
        this.preCacheButton = null;
        this.cancelPreCacheButton = null;
        this.clearCacheButton = null;
        this.statusDiv = null;
        
        this.isDisplaying = false;
        super.hide();
        this.plugin.logMessage('Settings tab hidden', 'debug');
    }
}

/**
 * Custom confirmation modal implementing Obsidian's Modal API for safe dialog operations.
 * 
 * Replaces native browser `confirm()` to prevent Windows focus loss issues in Electron.
 * Provides consistent styling and focus management with the Obsidian ecosystem.
 * 
 * @property message - Warning/confirmation text displayed to user
 * @property onConfirm - Async callback executed upon user confirmation
 * @property onCancel - Optional callback executed upon user cancellation
 */
class SimpleConfirmationModal extends Modal {
    private message: string;
    private onConfirm: () => Promise<void> | void;
    private onCancel?: () => void;

    /**
     * Creates modal instance with configuration.
     * 
     * @param app - Obsidian application instance for UI coordination
     * @param message - Warning/confirmation text displayed to user
     * @param onConfirm - Async callback executed upon user confirmation
     * @param onCancel - Optional callback executed upon user cancellation
     */
    constructor(app: App, message: string, onConfirm: () => Promise<void> | void, onCancel?: () => void) {
        super(app);
        this.message = message;
        this.onConfirm = onConfirm;
        this.onCancel = onCancel;
    }

    /**
     * Modal lifecycle method invoked when modal is presented.
     * 
     * Constructs DOM structure with warning message and action buttons.
     * Handles multi-line text and bullet points with proper HTML formatting.
     * Safety-focused with "No" as default selection to prevent accidental confirmations.
     */
    onOpen(): void {
        const { contentEl } = this;
        
        // Create message container with Obsidian's standard text styling
        const messageContainer = contentEl.createDiv({ cls: 'modal-message-container' });
        
        // Use the safe DOM method
        messageContainer.appendChild(this.formatMessageWithBulletPoints(this.message));
        
        // Button container with flex layout matching Obsidian's design system
        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
        
        // Affirmative action button with primary styling
        const yesButton = buttonContainer.createEl('button', { 
            text: 'Yes',
            cls: 'mod-cta'
        });
        yesButton.addEventListener('click', () => {
            this.close();
            this.onConfirm();
        });
        
        // Negative action button with warning styling and default focus
        const noButton = buttonContainer.createEl('button', { 
            text: 'No',
            cls: 'mod-warning'
        });
        noButton.addEventListener('click', () => {
            this.close();
            if (this.onCancel) this.onCancel();
        });
        
        // Safety-first focus strategy: Default to "No" to prevent accidental confirmations
        noButton.focus();
    }

    /**
     * Formats plain text messages with bullet points and line breaks into a DocumentFragment.
     * 
     * @param message - Plain text message with bullet points and newlines
     * @returns DocumentFragment containing formatted content
     */
    private formatMessageWithBulletPoints(message: string): DocumentFragment {
        const fragment = document.createDocumentFragment();
        
        // Split by double newlines to handle paragraphs
        const paragraphs = message.split('\n\n');
        
        for (const paragraph of paragraphs) {
            if (paragraph.includes('•')) {
                // This paragraph contains bullet points - format as list
                const ul = document.createElement('ul');
                ul.style.cssText = 'margin: 10px 0; padding-left: 20px;';
                
                // Split by newlines and filter out empty lines
                const lines = paragraph.split('\n').filter(line => line.trim());
                
                for (const line of lines) {
                    const li = document.createElement('li');
                    li.style.cssText = 'margin: 4px 0; color: var(--text-normal);';
                    
                    if (line.includes('•')) {
                        // Extract text after bullet
                        const text = line.substring(line.indexOf('•') + 1).trim();
                        li.textContent = text;
                    } else {
                        // Regular line without bullet
                        li.textContent = line;
                    }
                    ul.appendChild(li);
                }
                
                fragment.appendChild(ul);
            } else {
                // Regular paragraph without bullet points
                const p = document.createElement('p');
                p.style.cssText = 'margin: 10px 0; color: var(--text-normal);';
                
                // Replace single newlines with <br> elements
                const lines = paragraph.split('\n');
                lines.forEach((line, index) => {
                    // Use textContent for safety instead of innerHTML
                    const textNode = document.createTextNode(line);
                    p.appendChild(textNode);
                    if (index < lines.length - 1) {
                        p.appendChild(document.createElement('br'));
                    }
                });
                
                fragment.appendChild(p);
            }
        }
        
        return fragment;
    }

    /**
     * Basic HTML escaping to prevent XSS while allowing safe formatting.
     * 
     * Escapes special characters to ensure user safety while preserving
     * intentional formatting from trusted plugin messages.
     * 
     * @param text - Text to escape
     * @returns HTML-escaped text
     */
    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Modal lifecycle method invoked when modal is dismissed.
     * 
     * Ensures proper resource cleanup and restores editor focus.
     * Prevents memory leaks by clearing DOM references.
     */
    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
        
        /**
         * Critical focus restoration: Returns focus to editor after modal dismissal.
         * Prevents the "cursor not working" issue on Windows by forcing Obsidian's
         * focus management system to re-evaluate active input targets.
         */
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView) {
            // Deferred focus restoration to ensure modal tear-down completes
            window.setTimeout(() => {
                /**
                 * Obsidian API-compatible focus restoration.
                 * The correct way to restore focus in Obsidian is to:
                 * 1. Get the editor instance from the view
                 * 2. Focus the editor's CodeMirror instance
                 * 3. Trigger a resize event to force UI reflow
                 */
                
                // Get the editor instance from the MarkdownView
                const editor = (activeView as any).editor;
                if (editor) {
                    // Focus the editor if it has a focus method
                    if (editor.focus && typeof editor.focus === 'function') {
                        editor.focus();
                    }
                    
                    // Alternative: Focus the CodeMirror instance directly
                    const cmEditor = (editor as any).cmEditor;
                    if (cmEditor && cmEditor.focus && typeof cmEditor.focus === 'function') {
                        cmEditor.focus();
                    }
                }
                
                /**
                 * Windows-specific workaround: Trigger resize event to force
                 * Electron/Windows to re-evaluate focus and rendering state.
                 */
                window.dispatchEvent(new Event('resize'));
                
            }, 100);
        }
    }
}

// =====================================================================
// STREAMER SEARCH MODAL
// =====================================================================

/**
 * Fuzzy search modal for streamer selection with two-line layout.
 * 
 * Features clean presentation with streamer names and Twitch IDs
 * clearly separated, and visual indication of current selection.
 */
class StreamerSuggestModal extends FuzzySuggestModal<string> {
    private plugin: SevenTVPlugin;
    private onChoose: (streamerKey: string) => void;

    /**
     * Creates streamer search modal.
     * 
     * @param app - Obsidian application instance
     * @param plugin - Parent plugin instance
     * @param onChoose - Callback executed on streamer selection
     */
    constructor(app: App, plugin: SevenTVPlugin, onChoose: (streamerKey: string) => void) {
        super(app);
        this.plugin = plugin;
        this.onChoose = onChoose;
        this.setPlaceholder('Search for streamers...');
        this.limit = 999;
    }

    /**
     * Returns streamer keys for fuzzy search, sorted alphabetically.
     * 
     * @returns Array of streamer internal identifiers
     */
    getItems(): string[] {
        return Array.from(this.plugin.getStreamerDisplayMap().entries())
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([key]) => key);
    }

    /**
     * Returns display text for fuzzy matching.
     * 
     * @param item - Streamer internal identifier
     * @returns Streamer display name for search matching
     */
    getItemText(item: string): string {
        return this.plugin.getStreamerDisplayMap().get(item) || item;
    }

    /**
     * Handles streamer selection from the modal.
     * 
     * @param item - Selected streamer key
     * @param evt - Mouse or keyboard event that triggered selection
     */
    onChooseItem(item: string, evt: MouseEvent | KeyboardEvent): void {
        this.onChoose(item);
    }

    /**
     * Renders streamer suggestion with two-line vertical layout.
     * 
     * @param fuzzyMatch - Fuzzy match object containing item and match data
     * @param el - HTML element to populate with suggestion content
     */
    renderSuggestion(fuzzyMatch: FuzzyMatch<string>, el: HTMLElement): void {
        const item = fuzzyMatch.item;
        const displayName = this.plugin.getStreamerDisplayMap().get(item) || item;
        const twitchId = this.plugin.getStreamerIdMap().get(item) || 'Unknown ID';
        
        const container = el.createDiv({ cls: 'seven-tv-streamer-suggestion-container' });
        
        const infoSection = container.createDiv({ cls: 'seven-tv-streamer-info-section' });
        
        infoSection.createDiv({ 
            cls: 'seven-tv-streamer-suggestion-name',
            text: displayName
        });
        
        infoSection.createDiv({ 
            cls: 'seven-tv-streamer-suggestion-id',
            text: `Twitch ID: ${twitchId}`
        });
        
        if (this.plugin.settings.selectedStreamerId === item) {
            container.createDiv({ 
                text: '✓ Selected', 
                cls: 'seven-tv-streamer-selected-indicator' 
            });
        }
    }
}

// =====================================================================
// 7TV API INTEGRATION
// =====================================================================

/**
 * Fetches 7TV emote set for a given Twitch user ID.
 * 
 * Implements 7TV API v3 integration with error handling and timeout protection.
 * Returns empty map when no emotes are found.
 * 
 * @param twitchId - Numeric Twitch user identifier
 * @returns Promise resolving to map of emote names to 7TV IDs
 * 
 * @throws {Error} When API requests fail or return invalid data
 */
async function fetchEmotesForTwitchId(twitchId: string): Promise<Map<string, string>> {
    const emoteMap = new Map<string, string>();
    
    try {
        // Use console.debug for internal logging that respects browser dev tools
        if (window.console && console.debug) {
            console.debug(`[7TV] Fetching 7TV emotes for Twitch ID: ${twitchId}`);
        }
        
        const userRes = await fetch(`https://7tv.io/v3/users/twitch/${encodeURIComponent(twitchId)}`);
        if (!userRes.ok) throw new Error(`HTTP ${userRes.status}`);
        const userData = await userRes.json();
        
        const emoteSetId = userData?.emote_set?.id ||
            (userData?.emote_sets && userData.emote_sets[0]?.id);
        if (!emoteSetId) throw new Error('No emote set found');
        
        if (window.console && console.debug) {
            console.debug(`[7TV] Found emote set ID: ${emoteSetId}`);
        }
        
        const setRes = await fetch(`https://7tv.io/v3/emote-sets/${encodeURIComponent(emoteSetId)}`);
        if (!setRes.ok) throw new Error(`HTTP ${setRes.status}`);
        const setData = await setRes.json();
        
        if (setData?.emotes && Array.isArray(setData.emotes)) {
            if (window.console && console.debug) {
                console.debug(`[7TV] Processing ${setData.emotes.length} emotes from set`);
            }
            setData.emotes.forEach((emote: any) => {
                if (emote.name && emote.id) {
                    emoteMap.set(emote.name, emote.id);
                }
            });
            if (window.console && console.debug) {
                console.debug(`[7TV] Successfully mapped ${emoteMap.size} emotes`);
            }
        }
    } catch (error) {
        // Always log errors regardless of log level
        console.error('[7TV] Failed to fetch 7TV emotes:', error);
    }
    
    return emoteMap;
}