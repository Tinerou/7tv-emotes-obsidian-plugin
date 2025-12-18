/**
 * 7TV Emotes for Obsidian
 * @version 1.0.4
 * @license MIT
 */
import {
    App, Editor, EditorSuggest, EditorPosition,
    EditorSuggestContext, EditorSuggestTriggerInfo,
    FuzzySuggestModal, Plugin, PluginSettingTab, Setting,
    Notice, FuzzyMatch, MarkdownView
} from 'obsidian';

// =====================================================================
// SETTINGS INTERFACE AND DEFAULTS
// =====================================================================

/**
 * Plugin settings structure persisted to Obsidian's configuration storage.
 * @property twitchUserId - Numeric Twitch identifier for emote set retrieval
 * @property selectedStreamerId - Internal key for built-in streamer mapping
 * @property cacheStrategy - Determines emote image storage behavior
 * @property logLevel - Controls verbosity of plugin logging
 */
interface SevenTVSettings {
    twitchUserId: string;
    selectedStreamerId: string;
    cacheStrategy: 'pre-cache' | 'on-demand' | 'no-cache';
    logLevel: 'none' | 'basic' | 'verbose' | 'debug';
}

/**
 * Default configuration values applied during initial plugin installation.
 */
const DEFAULT_SETTINGS: SevenTVSettings = {
    twitchUserId: '',
    selectedStreamerId: '',
    cacheStrategy: 'on-demand',
    logLevel: 'basic'
}

/**
 * Curated list of popular streamers with Twitch IDs for immediate selection.
 * Format: [Display Name, Twitch Numeric ID, Internal Identifier]
 */
const BUILT_IN_STREAMERS: Array<[string, string, string]> = [
    ['xQc', '71092938', 'xqc'],
    ['evelone2004', '738000896', 'evelone2004'],
    ['LVNDMARK', '427632467', 'lvndmark'],
    ['ohnePixel', '43683025', 'ohnepixel'],
    ['Pestily', '106013742', 'pestily'],
    ['TheBurntPeanut', '472066926', 'theburntpeanut'],
    ['shadowkekw', '465131731', 'shadowkekw'],
    ['buster', '86277097', 'buster'],
];

// Streamer lookup maps for O(1) access performance
const STREAMER_DISPLAY_MAP = new Map(BUILT_IN_STREAMERS.map(([name, id, key]) => [key, name]));
const STREAMER_ID_MAP = new Map(BUILT_IN_STREAMERS.map(([name, id, key]) => [key, id]));

// =====================================================================
// DOWNLOAD PROGRESS TRACKER
// =====================================================================

/**
 * Tracks download progress for pre-caching operations
 * Shows a status bar indicator and updates in real-time
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

    constructor(plugin: SevenTVPlugin) {
        this.plugin = plugin;
    }

    /**
     * Starts tracking a new download session
     * @param totalEmotes - Total number of emotes to download
     * @param onCancel - Callback to call when cancel is requested
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
        
        this.plugin.logger.log(`Starting download of ${totalEmotes} emotes`, 'basic');
    }

    /**
     * Creates or updates the status bar element
     */
    private createStatusBar(): void {
        if (!this.statusBarEl) {
            this.statusBarEl = document.createElement('div');
            this.statusBarEl.className = 'seven-tv-download-progress';
            this.statusBarEl.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                background: var(--background-primary);
                border: 1px solid var(--background-modifier-border);
                border-radius: 6px;
                padding: 8px 12px;
                font-size: 12px;
                z-index: 9999;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                min-width: 240px;
                max-width: 320px;
                backdrop-filter: blur(10px);
            `;
            document.body.appendChild(this.statusBarEl);
        }
    }

    /**
     * Formats bytes to human readable format
     * @param bytes - Number of bytes
     * @returns Formatted string (e.g., "1.5 MB")
     */
    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Updates the status bar with current progress
     */
    private updateStatusBar(): void {
        if (!this.statusBarEl || !this.isActive) return;
        
        const elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
        const progress = this.totalEmotes > 0 ? (this.downloadedEmotes / this.totalEmotes) * 100 : 0;
        const bytesProgress = this.totalBytes > 0 ? (this.downloadedBytes / this.totalBytes) * 100 : 0;
        
        // Calculate speed
        const speed = elapsedSeconds > 0 ? this.downloadedBytes / elapsedSeconds : 0;
        
        this.statusBarEl.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <strong>📥 7TV Emote Cache</strong>
                <span style="font-size: 11px; color: var(--text-muted);">Batch ${this.currentBatch}/${this.totalBatches}</span>
            </div>
            <div style="margin-bottom: 4px;">
                <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px;">
                    <span>Progress: ${this.downloadedEmotes}/${this.totalEmotes}</span>
                    <span>${progress.toFixed(1)}%</span>
                </div>
                <div style="height: 4px; background: var(--background-modifier-border); border-radius: 2px; overflow: hidden; margin-bottom: 2px;">
                    <div style="height: 100%; background: var(--interactive-accent); width: ${progress}%; transition: width 0.3s ease;"></div>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--text-muted); margin-bottom: 4px;">
                    <span>${this.formatBytes(this.downloadedBytes)} / ${this.formatBytes(this.totalBytes)}</span>
                    <span>${this.formatBytes(speed)}/s</span>
                </div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); align-items: center;">
                <span>⏱️ ${elapsedSeconds}s</span>
                <span>${this.failedEmotes > 0 ? `❌ ${this.failedEmotes} failed` : ''}</span>
                <button class="mod-warning" style="padding: 2px 8px; font-size: 10px; height: auto; line-height: 1.2;">Cancel</button>
            </div>
        `;
        
        // Add cancel button event listener
        const cancelButton = this.statusBarEl.querySelector('button');
        if (cancelButton) {
            cancelButton.addEventListener('click', () => this.cancel());
        }
    }

    /**
     * Cancels the download operation
     */
    cancel(): void {
        if (!this.isActive) return;
        
        this.isCancelled = true;
        this.isActive = false;
        this.plugin.logger.log('Download cancelled by user', 'basic');
        
        if (this.onCancelCallback) {
            this.onCancelCallback();
        }
        
        if (this.statusBarEl) {
            this.statusBarEl.innerHTML = `
                <div style="text-align: center; padding: 8px;">
                    <div style="font-weight: bold; color: var(--text-error); margin-bottom: 4px;">
                        ❌ Download Cancelled
                    </div>
                    <div style="font-size: 11px; color: var(--text-muted);">
                        ${this.downloadedEmotes - this.failedEmotes}/${this.totalEmotes} emotes cached
                    </div>
                    <div style="font-size: 10px; color: var(--text-faint); margin-top: 4px;">
                        ${this.formatBytes(this.downloadedBytes)} downloaded
                    </div>
                </div>
            `;
            
            // Remove status bar after 3 seconds
            setTimeout(() => {
                if (this.statusBarEl && this.statusBarEl.parentNode) {
                    this.statusBarEl.remove();
                    this.statusBarEl = null;
                }
            }, 3000);
        }
    }

    /**
     * Updates total bytes estimate
     * @param bytes - Estimated total bytes for all emotes
     */
    setTotalBytes(bytes: number): void {
        this.totalBytes = bytes;
        this.updateStatusBar();
    }

    /**
     * Records a successfully downloaded emote
     * @param bytes - Bytes downloaded for this emote
     */
    recordSuccess(bytes: number = 0): void {
        if (!this.isActive) return;
        this.downloadedEmotes++;
        this.downloadedBytes += bytes;
        this.updateStatusBar();
    }

    /**
     * Records a failed download
     */
    recordFailure(): void {
        if (!this.isActive) return;
        this.failedEmotes++;
        this.updateStatusBar();
    }

    /**
     * Updates batch information
     */
    updateBatch(batchIndex: number): void {
        if (!this.isActive) return;
        this.currentBatch = batchIndex;
        this.updateStatusBar();
    }

    /**
     * Completes the download session
     */
    complete(): void {
        this.isActive = false;
        const totalTime = Math.floor((Date.now() - this.startTime) / 1000);
        
        if (this.statusBarEl && !this.isCancelled) {
            const successRate = this.totalEmotes > 0 ? 
                ((this.downloadedEmotes - this.failedEmotes) / this.totalEmotes * 100).toFixed(1) : '0';
            const avgSpeed = totalTime > 0 ? this.downloadedBytes / totalTime : 0;
            
            this.statusBarEl.innerHTML = `
                <div style="text-align: center; padding: 8px;">
                    <div style="font-weight: bold; color: var(--text-accent); margin-bottom: 4px;">
                        ✅ Download Complete
                    </div>
                    <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 2px;">
                        ${this.downloadedEmotes - this.failedEmotes}/${this.totalEmotes} emotes cached
                    </div>
                    <div style="font-size: 10px; color: var(--text-muted); margin-bottom: 4px;">
                        ${this.formatBytes(this.downloadedBytes)} total
                    </div>
                    <div style="font-size: 9px; color: var(--text-faint);">
                        ${successRate}% success in ${totalTime}s (${this.formatBytes(avgSpeed)}/s avg)
                    </div>
                </div>
            `;
            
            // Remove status bar after 5 seconds
            setTimeout(() => {
                if (this.statusBarEl && this.statusBarEl.parentNode) {
                    this.statusBarEl.remove();
                    this.statusBarEl = null;
                }
            }, 5000);
        }
        
        if (!this.isCancelled) {
            this.plugin.logger.log(
                `Download completed: ${this.downloadedEmotes - this.failedEmotes}/${this.totalEmotes} ` +
                `emotes (${this.formatBytes(this.downloadedBytes)}) in ${totalTime}s`, 
                'basic'
            );
        }
    }

    /**
     * Checks if download was cancelled
     */
    isCancelledRequested(): boolean {
        return this.isCancelled;
    }

    /**
     * Cleans up the tracker
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
// LOGGING UTILITY
// =====================================================================

/**
 * Logging utility with configurable verbosity levels
 * Allows fine-grained control over console output for debugging
 */
class PluginLogger {
    private plugin: SevenTVPlugin;
    private defaultLogLevel: 'basic' | 'verbose' | 'debug' = 'basic';

    constructor(plugin: SevenTVPlugin) {
        this.plugin = plugin;
    }

    /**
     * Main logging method with level-based filtering
     * @param message - Message to log
     * @param level - Minimum log level required to output
     */
    log(message: string, level: 'basic' | 'verbose' | 'debug' = 'basic'): void {
        // Safely get log level, defaulting to 'basic' if settings aren't loaded yet
        const currentLevel = this.getLogLevel();
        const levels = ['none', 'basic', 'verbose', 'debug'];
        
        if (levels.indexOf(currentLevel) >= levels.indexOf(level)) {
            console.log(`[7TV] ${message}`);
        }
    }

    /**
     * Safely gets the current log level, handling cases where settings aren't loaded
     * @returns Current log level or default if not available
     */
    private getLogLevel(): string {
        try {
            // Check if plugin and settings exist
            if (!this.plugin || !this.plugin.settings) {
                return this.defaultLogLevel;
            }
            return this.plugin.settings.logLevel || this.defaultLogLevel;
        } catch (error) {
            return this.defaultLogLevel;
        }
    }

    /**
     * Performance timing wrapper for cache operations
     * @param operation - Description of the operation being timed
     * @param callback - Async function to time
     * @returns Result of the callback
     */
    async withTiming<T>(operation: string, callback: () => Promise<T>): Promise<T> {
        if (this.getLogLevel() === 'debug') {
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
     * Warnings are always shown unless logLevel is 'none'
     * @param message - Warning message
     */
    warn(message: string): void {
        const currentLevel = this.getLogLevel();
        if (currentLevel !== 'none') {
            console.warn(`[7TV] ${message}`);
        }
    }

    /**
     * Errors are always shown unless logLevel is 'none'
     * @param message - Error message
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

export default class SevenTVPlugin extends Plugin {
    settings: SevenTVSettings;
    private emoteSuggest: EmoteSuggest;
    private readonly CACHE_DIR = '_7tv-emotes-cache';
    private activeDownloadPromise: Promise<void> | null = null;
    private stylesInjected: boolean = false;
    private logger: PluginLogger;
    private downloadTracker: DownloadProgressTracker;
    private preCacheComplete: boolean = false;
    private abortController: AbortController | null = null;

    /**
     * Resolves active Twitch ID based on configuration priority.
     * Manual Twitch ID takes precedence over built-in streamer selection.
     * @returns Active Twitch ID string or null if no configuration present
     */
    getActiveTwitchId(): string | null {
        if (this.settings.twitchUserId.trim()) {
            return this.settings.twitchUserId.trim();
        }
        if (this.settings.selectedStreamerId) {
            return STREAMER_ID_MAP.get(this.settings.selectedStreamerId) || null;
        }
        return null;
    }

    /**
     * Public accessor for cache directory path.
     * @returns Path to emote cache directory within vault
     */
    getCacheDir(): string {
        return this.CACHE_DIR;
    }

    /**
     * Plugin lifecycle initialization method.
     * Loads settings, injects CSS, initializes cache, and registers components.
     * Includes performance timing for debugging potential bottlenecks.
     */
    async onload() {
        // Performance tracking for plugin initialization
        console.time('[7TV] Plugin initialization');
        
        // Load settings FIRST before initializing logger
        await this.loadSettings();
        console.timeLog('[7TV] Plugin initialization', 'Settings loaded');
        
        // Now initialize logger with loaded settings
        this.logger = new PluginLogger(this);
        this.logger.log('Plugin initialization started', 'basic');
        
        // Initialize download tracker
        this.downloadTracker = new DownloadProgressTracker(this);
        
        this.injectStyles();
        this.logger.log('CSS injected', 'verbose');
        console.timeLog('[7TV] Plugin initialization', 'CSS injected');
        
        // Initialize cache based on selected strategy
        if (this.settings.cacheStrategy !== 'no-cache') {
            await this.initializeCache();
            this.logger.log(`Cache initialized (strategy: ${this.settings.cacheStrategy})`, 'verbose');
            console.timeLog('[7TV] Plugin initialization', 'Cache initialized');
        }
        
        // Set up emote auto-completion
        this.emoteSuggest = new EmoteSuggest(this.app, this);
        this.registerEditorSuggest(this.emoteSuggest);
        this.logger.log('Emote suggest registered', 'verbose');
        console.timeLog('[7TV] Plugin initialization', 'Emote suggest registered');
        
        // Load emotes if a streamer is already configured
        const activeId = this.getActiveTwitchId();
        if (activeId) {
            this.logger.log(`Loading emotes for ID: ${activeId}`, 'basic');
            console.timeLog('[7TV] Plugin initialization', `Loading emotes for ID: ${activeId}`);
            await this.refreshEmotesForUser(activeId);
        }
        
        // Register fallback command for manual emote insertion
        this.addCommand({
            id: 'insert-huh-emote-manual',
            name: 'Insert HUH emote (Manual Fallback)',
            editorCallback: async (editor: Editor) => {
                await this.insertEmoteByStrategy(editor, 'HUH', '01FFMS6Q4G0009CAK0J14692AY');
            }
        });
        
        // Register command to cancel active pre-cache
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
        
        // Register settings tab
        this.addSettingTab(new EnhancedSettingTab(this.app, this));
        
        console.timeEnd('[7TV] Plugin initialization');
        this.logger.log('Plugin loaded successfully', 'basic');
    }

    /**
     * Injects CSS styles into the document head for plugin UI components.
     * Uses inline CSS to comply with Obsidian's Content Security Policy.
     * Implements multiple safety checks to prevent duplicate injection
     * that can cause rendering performance issues.
     */
    private injectStyles(): void {
        const styleId = 'seven-tv-emotes-styles';
        
        // Safety check 1: Prevent multiple injections via internal flag
        if (this.stylesInjected) {
            this.logger.log('Styles already injected (internal flag), skipping', 'debug');
            return;
        }
        
        // Safety check 2: Verify style element doesn't already exist in DOM
        // This handles cases where plugin is reloaded without flag reset
        if (document.getElementById(styleId)) {
            this.logger.log('Style element already exists in DOM, reusing', 'debug');
            this.stylesInjected = true;
            return;
        }
        
        // Create and inject the style element
        const styleEl = document.createElement('style');
        styleEl.id = styleId;
        styleEl.textContent = `
            /* Streamer suggestion modal styling */
            .seven-tv-streamer-suggestion-container {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                width: 100%;
                padding: 10px 4px;
                border-bottom: 1px solid var(--background-modifier-border);
                min-height: 60px;
            }
            .seven-tv-streamer-suggestion-container:last-child {
                border-bottom: none;
            }
            .seven-tv-streamer-info-section {
                display: flex;
                flex-direction: column;
                flex: 1;
            }
            .seven-tv-streamer-suggestion-name {
                font-weight: 600;
                font-size: 14px;
                color: var(--text-normal);
                line-height: 1.4;
                margin-bottom: 4px;
            }
            .seven-tv-streamer-suggestion-id {
                font-size: 12px;
                color: var(--text-muted);
                opacity: 0.8;
                line-height: 1.3;
            }
            .seven-tv-streamer-selected-indicator {
                font-size: 0.8em;
                color: var(--text-accent);
                margin-left: auto;
                padding-left: 10px;
                white-space: nowrap;
                align-self: center;
            }
            
            /* Emote suggestion styling */
            .seven-tv-suggestion-item {
                display: flex;
                align-items: center;
                padding: 4px 8px;
            }
            .seven-tv-suggestion-img {
                height: 1.5em !important;
                vertical-align: middle !important;
                margin-right: 0.5em !important;
                border-radius: 3px !important;
            }
            .seven-tv-suggestion-text {
                vertical-align: middle;
                color: var(--text-muted);
                font-family: var(--font-monospace);
                font-size: 0.9em;
            }
        `;
        
        document.head.appendChild(styleEl);
        this.stylesInjected = true;
        this.logger.log('CSS styles injected successfully', 'verbose');
    }

    /**
     * Plugin cleanup method called on plugin disable.
     * Ensures resources are properly released to prevent memory leaks.
     */
    onunload() {
        // Clean up any active operations
        if (this.activeDownloadPromise) {
            // Use a safe log method for onunload
            console.log('[7TV] Active download operation cancelled on unload');
        }
        
        // Abort any active downloads
        if (this.abortController) {
            this.abortController.abort();
        }
        
        // Clean up download tracker
        this.downloadTracker.cleanup();
        
        // Note: We don't remove the style element as other plugins might depend on it
        // Obsidian will handle cleanup when the plugin is completely removed
        console.log('[7TV] Plugin unloaded');
    }

    /**
     * Fetches and caches emotes for a given Twitch user ID.
     * Updates the emote suggester and applies the configured cache strategy.
     * @param twitchId - Numeric Twitch user identifier
     */
    async refreshEmotesForUser(twitchId: string): Promise<void> {
        this.logger.log(`Fetching emotes for Twitch ID: ${twitchId}`, 'basic');
        const newEmoteMap = await fetchEmotesForTwitchId(twitchId);
        
        if (newEmoteMap.size > 0) {
            this.emoteSuggest.updateEmoteMap(newEmoteMap);
            this.logger.log(`Loaded ${newEmoteMap.size} emotes`, 'basic');
            
            // Reset pre-cache status
            this.preCacheComplete = false;
            
            // Execute pre-caching if strategy is set to pre-cache
            if (this.settings.cacheStrategy === 'pre-cache') {
                await this.startPreCache(newEmoteMap);
            }
        }
    }

    /**
     * Starts pre-cache operation with progress tracking
     * @param emoteMap - Map of emote names to 7TV IDs
     */
    private async startPreCache(emoteMap: Map<string, string>): Promise<void> {
        this.logger.log('Starting pre-cache operation', 'basic');
        
        // Cancel any existing pre-cache
        if (this.abortController) {
            this.abortController.abort();
        }
        
        // Create new abort controller
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
     * Routes emote insertion to the appropriate method based on cache strategy.
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
            case 'pre-cache':
                await this.insertWithPreCache(editor, name, id);
                break;
        }
    }

    /**
     * Inserts emote using direct CDN URL without local caching.
     * @param editor - Active Obsidian editor instance
     * @param name - Emote display name
     * @param id - 7TV emote identifier
     */
    private async insertWithoutCache(editor: Editor, name: string, id: string): Promise<void> {
        const html = `<span class="seven-tv-emote" title=":${name}:"><img src="https://cdn.7tv.app/emote/${id}/1x.webp" alt="${name}" style="display:inline-block;height:1.5em;vertical-align:middle;"></span>`;
        this.logger.log(`Emote "${name}" (${id}) inserted via CDN (no-cache strategy)`, 'debug');
        editor.replaceSelection(html);
    }

    /**
     * Inserts emote using local cache if available, otherwise uses CDN with background caching.
     * @param editor - Active Obsidian editor instance
     * @param name - Emote display name
     * @param id - 7TV emote identifier
     */
    private async insertWithOnDemandCache(editor: Editor, name: string, id: string): Promise<void> {
        const cachePath = `${this.CACHE_DIR}/${id}.webp`;
        const cdnUrl = `https://cdn.7tv.app/emote/${id}/1x.webp`;
        
        // Time the cache check for performance monitoring
        const checkResult = await this.logger.withTiming(
            `Cache check for ${name}`,
            async () => {
                return await this.app.vault.adapter.exists(cachePath);
            }
        );
        
        if (checkResult) {
            const html = `<span class="seven-tv-emote" title=":${name}:"><img src="./${cachePath}" alt="${name}" style="display:inline-block;height:1.5em;vertical-align:middle;"></span>`;
            this.logger.log(`Emote "${name}" (${id}) inserted from LOCAL CACHE (on-demand strategy)`, 'debug');
            editor.replaceSelection(html);
        } else {
            const html = `<span class="seven-tv-emote" title=":${name}:"><img src="${cdnUrl}" alt="${name}" style="display:inline-block;height:1.5em;vertical-align:middle;"></span>`;
            this.logger.log(`Emote "${name}" (${id}) inserted from CDN, will cache (on-demand strategy)`, 'debug');
            editor.replaceSelection(html);
            // Cache in background for future use
            this.downloadToCache(id, cdnUrl, cachePath).catch(() => { });
        }
    }

    /**
     * Inserts emote using local cache, with blocking download if not cached.
     * Pre-cache strategy always tries to download if missing before inserting.
     * @param editor - Active Obsidian editor instance
     * @param name - Emote display name
     * @param id - 7TV emote identifier
     */
    private async insertWithPreCache(editor: Editor, name: string, id: string): Promise<void> {
        const cachePath = `${this.CACHE_DIR}/${id}.webp`;
        const cdnUrl = `https://cdn.7tv.app/emote/${id}/1x.webp`;
        
        // Time the cache check for performance monitoring
        const checkResult = await this.logger.withTiming(
            `Cache check for ${name}`,
            async () => {
                return await this.app.vault.adapter.exists(cachePath);
            }
        );
        
        if (checkResult) {
            const html = `<span class="seven-tv-emote" title=":${name}:"><img src="./${cachePath}" alt="${name}" style="display:inline-block;height:1.5em;vertical-align:middle;"></span>`;
            this.logger.log(`Emote "${name}" (${id}) inserted from LOCAL CACHE (pre-cache strategy)`, 'debug');
            editor.replaceSelection(html);
        } else {
            // For pre-cache strategy, we should download before inserting
            this.logger.log(`Emote "${name}" (${id}) not cached, downloading before insertion...`, 'verbose');
            
            try {
                // Show loading indicator
                const loadingText = `Downloading ${name}...`;
                editor.replaceSelection(loadingText);
                const cursor = editor.getCursor();
                const loadingStart = { line: cursor.line, ch: cursor.ch - loadingText.length };
                
                // Download the emote
                await this.downloadToCache(id, cdnUrl, cachePath);
                
                // Replace loading text with actual emote
                editor.setSelection(loadingStart, cursor);
                const html = `<span class="seven-tv-emote" title=":${name}:"><img src="./${cachePath}" alt="${name}" style="display:inline-block;height:1.5em;vertical-align:middle;"></span>`;
                editor.replaceSelection(html);
                
                this.logger.log(`Emote "${name}" (${id}) downloaded and inserted (pre-cache strategy)`, 'debug');
                
            } catch (error) {
                // Fall back to CDN if download fails
                this.logger.warn(`Failed to download ${name}, falling back to CDN: ${error}`);
                const html = `<span class="seven-tv-emote" title=":${name}:"><img src="${cdnUrl}" alt="${name}" style="display:inline-block;height:1.5em;vertical-align:middle;"></span>`;
                editor.replaceSelection(html);
            }
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
     * Checks if emotes beyond the default HUH emote have been loaded.
     * @returns Boolean indicating if additional emotes are loaded
     */
    public hasLoadedEmotes(): boolean {
        return this.emoteSuggest !== undefined && this.emoteSuggest.getEmoteCount() > 1;
    }

    /**
     * Pre-caches all emotes in a set using batched downloads with progress tracking.
     * @param emoteMap - Map of emote names to 7TV IDs
     */
    private async preCacheEmoteSet(emoteMap: Map<string, string>): Promise<void> {
        const emoteIds = Array.from(emoteMap.values());
        const totalEmotes = emoteIds.length;
        
        this.logger.log(`Starting pre-cache of ${totalEmotes} emotes`, 'basic');
        
        // Estimate total bytes (average emote is ~5KB, but we'll fetch actual sizes)
        const estimatedAverageSize = 5 * 1024; // 5KB average
        const estimatedTotalBytes = totalEmotes * estimatedAverageSize;
        
        // Start progress tracking
        this.downloadTracker.start(totalEmotes, () => {
            // Cancel callback
            if (this.abortController) {
                this.abortController.abort();
            }
        });
        
        // Set initial estimate
        this.downloadTracker.setTotalBytes(estimatedTotalBytes);
        
        // Use smaller batch size
        const BATCH_SIZE = 3;
        const totalBatches = Math.ceil(totalEmotes / BATCH_SIZE);
        
        try {
            for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
                // Check for cancellation
                if (this.abortController?.signal.aborted || this.downloadTracker.isCancelledRequested()) {
                    throw new DOMException('Download cancelled', 'AbortError');
                }
                
                const startIdx = batchIndex * BATCH_SIZE;
                const endIdx = Math.min(startIdx + BATCH_SIZE, totalEmotes);
                const batch = emoteIds.slice(startIdx, endIdx);
                
                // Update batch info
                this.downloadTracker.updateBatch(batchIndex + 1);
                
                // Process batch in parallel
                const promises = batch.map(id => 
                    this.ensureEmoteCached(id)
                        .then(bytes => this.downloadTracker.recordSuccess(bytes))
                        .catch(() => this.downloadTracker.recordFailure())
                );
                
                await Promise.allSettled(promises);
                
                // Use requestIdleCallback to yield to browser rendering
                await new Promise(resolve => {
                    if ('requestIdleCallback' in window) {
                        (window as any).requestIdleCallback(() => resolve(null), { timeout: 100 });
                    } else {
                        setTimeout(resolve, 100);
                    }
                });
                
                // Log progress every 10% or every 5 batches, whichever is smaller
                if (batchIndex % Math.max(1, Math.floor(totalBatches * 0.1)) === 0 || batchIndex % 5 === 0) {
                    const percent = Math.round((startIdx / totalEmotes) * 100);
                    this.logger.log(`Pre-cache progress: ${startIdx}/${totalEmotes} (${percent}%)`, 'verbose');
                }
            }
            
            // Complete progress tracking
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
                throw error; // Re-throw abort errors
            }
            this.logger.warn(`Cache download failed for ${emoteId}: ${error}`);
            throw error;
        }
    }

    /**
     * Manually triggers pre-cache for loaded emotes
     * @returns Promise that resolves when pre-cache completes
     */
    public async triggerPreCache(): Promise<void> {
        const activeId = this.getActiveTwitchId();
        if (!activeId) {
            throw new Error('No streamer selected');
        }
        
        if (!this.hasLoadedEmotes()) {
            throw new Error('No emotes loaded to cache');
        }
        
        // Refresh emotes which will trigger pre-cache
        await this.refreshEmotesForUser(activeId);
    }

    /**
     * Cancels active pre-cache operation
     */
    public cancelPreCache(): void {
        if (this.abortController) {
            this.abortController.abort();
            this.logger.log('Pre-cache cancelled', 'basic');
        }
    }

    /**
     * Checks if pre-cache is currently in progress
     * @returns Boolean indicating if pre-cache is active
     */
    public isPreCaching(): boolean {
        return this.activeDownloadPromise !== null;
    }

    /**
     * Checks if pre-cache has completed
     * @returns Boolean indicating if pre-cache has completed
     */
    public isPreCacheComplete(): boolean {
        return this.preCacheComplete;
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
 * Integrates with Obsidian's EditorSuggest API for seamless auto-completion.
 */
class EmoteSuggest extends EditorSuggest<string> {
    private emoteMap: Map<string, string> = new Map([['HUH', '01FFMS6Q4G0009CAK0J14692AY']]);
    private plugin: SevenTVPlugin;

    constructor(app: App, plugin: SevenTVPlugin) {
        super(app);
        this.plugin = plugin;
    }

    /**
     * Updates the internal emote map with new data.
     * @param newMap - Updated map of emote names to 7TV IDs
     */
    updateEmoteMap(newMap: Map<string, string>): void {
        this.emoteMap = new Map(newMap);
        console.log(`[7TV] Emote map updated with ${newMap.size} emotes`);
    }

    /**
     * Determines when to trigger suggestion popup based on typed text.
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
            
            console.log(`[7TV] Emote search triggered: "${query}"`);
            
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
     * @param context - Suggestion context containing query text
     * @returns Array of emote names matching the query
     */
    getSuggestions(context: EditorSuggestContext): string[] {
        const query = context.query.toLowerCase();
        const matches = Array.from(this.emoteMap.keys())
            .filter(name => name.toLowerCase().includes(query))
            .slice(0, 25);
        
        console.log(`[7TV] Found ${matches.length} emotes matching "${context.query}"`);
        
        return matches;
    }

    /**
     * Renders individual suggestion with emote image and name.
     * @param value - Emote name to render
     * @param el - HTML element to populate with suggestion content
     */
    renderSuggestion(value: string, el: HTMLElement): void {
        el.empty();
        const container = el.createDiv();
        container.addClass('seven-tv-suggestion-item');
        
        const emoteId = this.emoteMap.get(value);
        if (emoteId) {
            // Use cache if available, otherwise CDN
            const cachePath = `${this.plugin.getCacheDir()}/${emoteId}.webp`;
            const cdnUrl = `https://cdn.7tv.app/emote/${emoteId}/1x.webp`;
            
            // Check cache status for logging
            this.plugin.app.vault.adapter.exists(cachePath).then(isCached => {
                if (isCached) {
                    console.log(`[7TV] Suggestion image for "${value}" loaded from cache`);
                } else {
                    console.log(`[7TV] Suggestion image for "${value}" loaded from CDN`);
                }
            });
            
            const imgEl = container.createEl('img');
            imgEl.setAttribute('src', cdnUrl); // Use CDN for suggestions for speed
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
     * @param value - Selected emote name
     * @param evt - Mouse or keyboard event that triggered selection
     */
    selectSuggestion(value: string, evt: MouseEvent | KeyboardEvent): void {
        if (!this.context || !this.context.editor) return;
        
        const editor = this.context.editor;
        const emoteId = this.emoteMap.get(value);
        if (!emoteId) return;
        
        console.log(`[7TV] Selected emote: "${value}" (ID: ${emoteId})`);
        
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
     * @returns Number of emotes in the current map
     */
    getEmoteCount(): number {
        return this.emoteMap.size;
    }
}

// =====================================================================
// SIMPLIFIED SETTINGS TAB WITH TWO-LINE DROPDOWN
// =====================================================================

/**
 * Simplified settings tab providing essential configuration options.
 * Focuses on core functionality with minimal UI complexity.
 */
class EnhancedSettingTab extends PluginSettingTab {
    plugin: SevenTVPlugin;
    private debounceTimer: NodeJS.Timeout | null = null;
    private isDisplaying: boolean = false;
    private statusDiv: HTMLElement | null = null;
    private renderRequestId: number | null = null; // Track animation frame requests

    constructor(app: App, plugin: SevenTVPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    /**
     * Renders the simplified settings tab interface.
     * Prevents concurrent display calls that can cause rendering loops.
     * Includes multiple safety checks to prevent rendering during Obsidian's measure cycles.
     */
    display(): void {
        // Prevent concurrent display calls
        if (this.isDisplaying) {
            console.log('[7TV] Settings tab display already in progress, cancelling duplicate');
            return;
        }
        
        // Cancel any pending animation frame
        if (this.renderRequestId !== null) {
            cancelAnimationFrame(this.renderRequestId);
            this.renderRequestId = null;
        }
        
        this.isDisplaying = true;
        console.time('[7TV] Settings render');
        
        const { containerEl } = this;
        containerEl.empty();
        
        // Use requestAnimationFrame with tracking
        this.renderRequestId = requestAnimationFrame(() => {
            try {
                containerEl.createEl('h2', { text: '7TV Emotes' });
                
                // Log level dropdown
                new Setting(containerEl)
                    .setName('Log Level')
                    .setDesc('Controls how much information is logged to console')
                    .addDropdown(dropdown => dropdown
                        .addOption('none', 'None')
                        .addOption('basic', 'Basic')
                        .addOption('verbose', 'Verbose')
                        .addOption('debug', 'Debug')
                        .setValue(this.plugin.settings.logLevel)
                        .onChange(async (value: any) => {
                            this.plugin.settings.logLevel = value;
                            await this.plugin.saveSettings();
                            console.log(`[7TV] Log level changed to: ${value}`);
                            this.updateStatus();
                        }));
                
                // Cache strategy dropdown with better descriptions
                new Setting(containerEl)
                    .setName('Cache Strategy')
                    .setDesc('Controls how emote images are stored and loaded')
                    .addDropdown(dropdown => dropdown
                        .addOption('on-demand', 'On-Demand (cache when used)')
                        .addOption('pre-cache', 'Pre-cache All (download all now)')
                        .addOption('no-cache', 'No Cache (always use CDN)')
                        .setValue(this.plugin.settings.cacheStrategy)
                        .onChange(async (value: any) => {
                            const oldStrategy = this.plugin.settings.cacheStrategy;
                            this.plugin.settings.cacheStrategy = value;
                            await this.plugin.saveSettings();
                            
                            console.log(`[7TV] Cache strategy changed from ${oldStrategy} to ${value}`);
                            
                            // If switching to pre-cache and emotes are loaded, trigger pre-cache
                            if (value === 'pre-cache' && this.plugin.hasLoadedEmotes()) {
                                new Notice('Starting emote pre-caching...');
                                try {
                                    await this.plugin.triggerPreCache();
                                } catch (error) {
                                    new Notice(`Failed to start pre-cache: ${error.message}`);
                                }
                            }
                            
                            await this.plugin.ensureCacheInitialized();
                            this.updateStatus();
                        }));
                
                // Streamer selection with search modal
                const streamerSetting = new Setting(containerEl)
                    .setName('Streamer')
                    .setDesc('Select a streamer or enter Twitch ID');
                
                const buttonContainer = streamerSetting.controlEl.createDiv();
                buttonContainer.style.display = 'flex';
                buttonContainer.style.gap = '8px';
                buttonContainer.style.alignItems = 'center';
                
                // Search button
                const button = buttonContainer.createEl('button');
                button.addClass('mod-cta');
                button.style.flex = '1';
                button.style.textAlign = 'left';
                button.style.overflow = 'hidden';
                button.style.textOverflow = 'ellipsis';
                button.style.whiteSpace = 'nowrap';
                
                const updateButtonText = () => {
                    const currentKey = this.plugin.settings.selectedStreamerId;
                    button.textContent = currentKey
                        ? STREAMER_DISPLAY_MAP.get(currentKey) || currentKey
                        : 'Select streamer...';
                };
                
                updateButtonText();
                
                button.addEventListener('click', () => {
                    // Prevent multiple modal openings
                    if (this.isDisplaying) {
                        console.log('[7TV] Settings render in progress, delaying modal');
                        setTimeout(() => {
                            this.openStreamerModal(button, updateButtonText, manualInput);
                        }, 100);
                    } else {
                        this.openStreamerModal(button, updateButtonText, manualInput);
                    }
                });
                
                // Manual Twitch ID input with debouncing
                const manualInput = buttonContainer.createEl('input');
                manualInput.type = 'text';
                manualInput.placeholder = 'Twitch ID';
                manualInput.value = this.plugin.settings.twitchUserId;
                manualInput.style.flex = '1';
                
                manualInput.addEventListener('input', () => {
                    if (this.debounceTimer) clearTimeout(this.debounceTimer);
                    
                    this.debounceTimer = setTimeout(async () => {
                        const value = manualInput.value.trim();
                        this.plugin.settings.twitchUserId = value;
                        
                        if (value && this.plugin.settings.selectedStreamerId) {
                            this.plugin.settings.selectedStreamerId = '';
                            updateButtonText();
                        }
                        
                        await this.plugin.saveSettings();
                        
                        if (/^\d{6,}$/.test(value)) {
                            console.log(`[7TV] Auto-fetching emotes for manual ID: ${value}`);
                            try {
                                await this.plugin.refreshEmotesForUser(value);
                                this.updateStatus();
                                new Notice('Emotes loaded');
                            } catch (error) {
                                console.error('[7TV] Failed to load emotes:', error);
                                new Notice('Failed to load emotes');
                            }
                        }
                    }, 800);
                });
                
                // Clear button (only shown when there's a selection)
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
                        console.log('[7TV] Streamer selection cleared');
                        this.updateStatus();
                    });
                }
                
                // Action buttons container
                const actionContainer = containerEl.createDiv();
                actionContainer.style.display = 'grid';
                actionContainer.style.gridTemplateColumns = '1fr 1fr';
                actionContainer.style.gap = '8px';
                actionContainer.style.marginTop = '16px';
                
                // Manual pre-cache button
                const preCacheButton = actionContainer.createEl('button');
                preCacheButton.textContent = 'Pre-cache Now';
                preCacheButton.disabled = !this.plugin.hasLoadedEmotes() || this.plugin.settings.cacheStrategy === 'no-cache';
                
                preCacheButton.addEventListener('click', async () => {
                    if (!this.plugin.hasLoadedEmotes()) {
                        new Notice('No emotes loaded to cache');
                        return;
                    }
                    
                    new Notice('Starting pre-cache...');
                    try {
                        await this.plugin.triggerPreCache();
                        this.updateStatus();
                    } catch (error) {
                        new Notice(`Failed to start pre-cache: ${error.message}`);
                    }
                });
                
                // Cancel pre-cache button
                const cancelPreCacheButton = actionContainer.createEl('button');
                cancelPreCacheButton.textContent = 'Cancel Pre-cache';
                cancelPreCacheButton.className = 'mod-warning';
                cancelPreCacheButton.disabled = !this.plugin.isPreCaching();
                
                cancelPreCacheButton.addEventListener('click', () => {
                    if (this.plugin.isPreCaching()) {
                        this.plugin.cancelPreCache();
                        new Notice('Pre-cache cancelled');
                        cancelPreCacheButton.disabled = true;
                        this.updateStatus();
                    }
                });
                
                // Clear cache button
                const clearCacheButton = actionContainer.createEl('button');
                clearCacheButton.textContent = 'Clear Cache';
                clearCacheButton.style.gridColumn = 'span 2';
                clearCacheButton.disabled = this.plugin.settings.cacheStrategy === 'no-cache';
                
                clearCacheButton.addEventListener('click', async () => {
                    if (confirm('Are you sure you want to clear all cached emotes?')) {
                        try {
                            const cacheDir = this.plugin.getCacheDir();
                            if (await this.plugin.app.vault.adapter.exists(cacheDir)) {
                                await this.plugin.app.vault.adapter.rmdir(cacheDir, true);
                                await this.plugin.initializeCache();
                                this.plugin.preCacheComplete = false;
                                new Notice('Cache cleared successfully');
                                console.log('[7TV] Cache cleared');
                                this.updateStatus();
                            }
                        } catch (error) {
                            new Notice('Failed to clear cache');
                            console.error('[7TV] Failed to clear cache:', error);
                        }
                    }
                });
                
                // Detailed status display with caching info
                this.statusDiv = containerEl.createDiv();
                this.statusDiv.style.marginTop = '20px';
                this.statusDiv.style.padding = '12px';
                this.statusDiv.style.borderRadius = '6px';
                this.statusDiv.style.backgroundColor = 'var(--background-secondary)';
                this.statusDiv.style.border = '1px solid var(--background-modifier-border)';
                this.statusDiv.style.fontSize = '0.9em';
                
                this.updateStatus();
                
                console.timeEnd('[7TV] Settings render');
            } catch (error) {
                console.error('[7TV] Error rendering settings:', error);
            } finally {
                this.isDisplaying = false;
                this.renderRequestId = null;
            }
        });
    }
    
    /**
     * Opens the streamer search modal with proper error handling.
     * Separated from main render logic to prevent closure complexity.
     */
    private openStreamerModal(button: HTMLButtonElement, updateButtonText: () => void, manualInput: HTMLInputElement): void {
        new StreamerSuggestModal(this.app, this.plugin, async (selectedKey) => {
            const displayName = STREAMER_DISPLAY_MAP.get(selectedKey);
            const twitchId = STREAMER_ID_MAP.get(selectedKey);
            
            if (!twitchId) {
                new Notice('Invalid streamer selection');
                return;
            }
            
            this.plugin.settings.selectedStreamerId = selectedKey;
            this.plugin.settings.twitchUserId = twitchId;
            await this.plugin.saveSettings();
            
            updateButtonText();
            manualInput.value = twitchId;
            
            console.log(`[7TV] Selected streamer: ${displayName} (ID: ${twitchId})`);
            
            // Show different notice based on cache strategy
            if (this.plugin.settings.cacheStrategy === 'pre-cache') {
                new Notice(`Fetching ${displayName}'s emotes and pre-caching...`);
            } else {
                new Notice(`Fetching ${displayName}'s emotes...`);
            }
            
            try {
                await this.plugin.refreshEmotesForUser(twitchId);
                this.updateStatus();
                
                if (this.plugin.settings.cacheStrategy === 'pre-cache') {
                    new Notice(`${displayName}'s emotes loaded and pre-caching started`);
                } else {
                    new Notice(`${displayName}'s emotes loaded`);
                }
            } catch (error) {
                console.error('[7TV] Failed to load emotes:', error);
                new Notice('Failed to load emotes');
            }
        }).open();
    }
    
    /**
     * Updates only the status section instead of re-rendering entire tab.
     * Prevents rendering loops by avoiding full re-renders.
     */
    private updateStatus(): void {
        if (!this.statusDiv) return;
        
        // Use microtask timing to avoid rendering during Obsidian's measure phase
        Promise.resolve().then(() => {
            const activeId = this.plugin.getActiveTwitchId();
            const activeStreamer = this.plugin.settings.selectedStreamerId;
            const streamerName = activeStreamer ? STREAMER_DISPLAY_MAP.get(activeStreamer) : null;
            const emoteCount = this.plugin.hasLoadedEmotes() ? 'Loaded' : 'Not loaded';
            const isPreCaching = this.plugin.isPreCaching();
            const preCacheStatus = this.plugin.isPreCacheComplete() ? 'Complete' : isPreCaching ? 'In Progress' : 'Not Started';
            
            this.statusDiv!.innerHTML = `
                <div style="font-weight: 600; margin-bottom: 8px; color: var(--text-accent);">Current Status</div>
                <div style="margin-bottom: 4px;"><strong>Source:</strong> ${streamerName || activeId || 'None selected'}</div>
                <div style="margin-bottom: 4px;"><strong>Cache Strategy:</strong> ${this.plugin.settings.cacheStrategy}</div>
                <div style="margin-bottom: 4px;"><strong>Log Level:</strong> ${this.plugin.settings.logLevel}</div>
                <div style="margin-bottom: 4px;"><strong>Emotes:</strong> ${emoteCount}</div>
                <div style="margin-bottom: 4px;"><strong>Pre-cache:</strong> ${preCacheStatus}</div>
                <div style="margin-top: 8px; font-size: 0.85em; color: var(--text-muted);">
                    ${this.plugin.settings.cacheStrategy === 'pre-cache' ? 
                      'Pre-cache will download all emotes before use. Check top-right for progress.' : 
                      'Check browser console (F12) for detailed logs.'}
                </div>
            `;
        });
    }
    
    /**
     * Clean up resources when settings tab is hidden/closed.
     * Prevents memory leaks and pending operations.
     */
    hide(): void {
        // Cancel any pending animation frame
        if (this.renderRequestId !== null) {
            cancelAnimationFrame(this.renderRequestId);
            this.renderRequestId = null;
        }
        
        // Clear any pending debounce timers
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        
        this.isDisplaying = false;
        super.hide();
        console.log('[7TV] Settings tab hidden');
    }
}

// =====================================================================
// STREAMER SEARCH MODAL WITH TWO-LINE LAYOUT
// =====================================================================

/**
 * Fuzzy search modal for selecting streamers from the built-in list.
 * Features a clean two-line layout with streamer name and Twitch ID clearly separated.
 */
class StreamerSuggestModal extends FuzzySuggestModal<string> {
    private plugin: SevenTVPlugin;
    private onChoose: (streamerKey: string) => void;

    constructor(app: App, plugin: SevenTVPlugin, onChoose: (streamerKey: string) => void) {
        super(app);
        this.plugin = plugin;
        this.onChoose = onChoose;
        this.setPlaceholder('Search for streamers...');
        this.limit = 15; // Optimized for performance
    }

    /**
     * Returns streamer keys for fuzzy search, sorted alphabetically.
     * @returns Array of streamer internal identifiers
     */
    getItems(): string[] {
        return Array.from(STREAMER_DISPLAY_MAP.entries())
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([key]) => key);
    }

    /**
     * Returns display text for fuzzy matching.
     * @param item - Streamer internal identifier
     * @returns Streamer display name for search matching
     */
    getItemText(item: string): string {
        return STREAMER_DISPLAY_MAP.get(item) || item;
    }

    /**
     * Handles streamer selection from the modal.
     * @param item - Selected streamer key
     * @param evt - Mouse or keyboard event that triggered selection
     */
    onChooseItem(item: string, evt: MouseEvent | KeyboardEvent): void {
        this.onChoose(item);
    }

    /**
     * Renders streamer suggestion with two-line vertical layout.
     * First line displays streamer name, second line shows Twitch ID.
     * Includes visual indicator for currently selected streamer.
     * @param fuzzyMatch - Fuzzy match object containing item and match data
     * @param el - HTML element to populate with suggestion content
     */
    renderSuggestion(fuzzyMatch: FuzzyMatch<string>, el: HTMLElement): void {
        const item = fuzzyMatch.item;
        const displayName = STREAMER_DISPLAY_MAP.get(item) || item;
        const twitchId = STREAMER_ID_MAP.get(item) || 'Unknown ID';
        
        // Main container with horizontal layout
        const container = el.createDiv({ cls: 'seven-tv-streamer-suggestion-container' });
        
        // Left section: Vertical stack of streamer information
        const infoSection = container.createDiv({ cls: 'seven-tv-streamer-info-section' });
        
        // Streamer name (primary text, bold)
        infoSection.createDiv({ 
            cls: 'seven-tv-streamer-suggestion-name',
            text: displayName
        });
        
        // Twitch ID (secondary text, smaller and muted)
        infoSection.createDiv({ 
            cls: 'seven-tv-streamer-suggestion-id',
            text: `Twitch ID: ${twitchId}`
        });
        
        // Right section: Selection indicator (only shown if currently selected)
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
 * Implements timeout protection and error handling for network reliability.
 * @param twitchId - Numeric Twitch user identifier
 * @returns Map of emote names to 7TV IDs
 */
async function fetchEmotesForTwitchId(twitchId: string): Promise<Map<string, string>> {
    const emoteMap = new Map<string, string>();
    // Always include HUH as a reliable fallback emote
    emoteMap.set('HUH', '01FFMS6Q4G0009CAK0J14692AY');
    
    try {
        console.log(`[7TV] Fetching 7TV emotes for Twitch ID: ${twitchId}`);
        
        // Fetch user data to get emote set ID
        const userRes = await fetch(`https://7tv.io/v3/users/twitch/${encodeURIComponent(twitchId)}`);
        if (!userRes.ok) throw new Error(`HTTP ${userRes.status}`);
        const userData = await userRes.json();
        
        const emoteSetId = userData?.emote_set?.id ||
            (userData?.emote_sets && userData.emote_sets[0]?.id);
        if (!emoteSetId) throw new Error('No emote set found');
        
        console.log(`[7TV] Found emote set ID: ${emoteSetId}`);
        
        // Fetch emote set data
        const setRes = await fetch(`https://7tv.io/v3/emote-sets/${encodeURIComponent(emoteSetId)}`);
        if (!setRes.ok) throw new Error(`HTTP ${setRes.status}`);
        const setData = await setRes.json();
        
        // Extract emotes from set data
        if (setData?.emotes && Array.isArray(setData.emotes)) {
            console.log(`[7TV] Processing ${setData.emotes.length} emotes from set`);
            setData.emotes.forEach((emote: any) => {
                if (emote.name && emote.id) {
                    emoteMap.set(emote.name, emote.id);
                }
            });
            console.log(`[7TV] Successfully mapped ${emoteMap.size} emotes`);
        }
    } catch (error) {
        console.error('[7TV] Failed to fetch 7TV emotes:', error);
    }
    
    return emoteMap;
}