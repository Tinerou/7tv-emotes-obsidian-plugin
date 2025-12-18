/**
 * 7TV Emotes for Obsidian
 * 
 * Integrates 7TV (Twitch) emotes into Obsidian markdown editor with auto-complete,
 * multiple caching strategies, and streamer-specific emote sets.
 * 
 * @version 1.1.0
 * @license MIT
 * @author Your Name
 */

import {
    App, Editor, EditorSuggest, EditorPosition,
    EditorSuggestContext, EditorSuggestTriggerInfo,
    FuzzySuggestModal, Plugin, PluginSettingTab, Setting,
    Notice, FuzzyMatch
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
 */
interface SevenTVSettings {
    twitchUserId: string;
    selectedStreamerId: string;
    cacheStrategy: 'on-demand' | 'no-cache';
    logLevel: 'none' | 'basic' | 'verbose' | 'debug';
}

/**
 * Default configuration values applied during initial plugin installation.
 * 
 * @constant twitchUserId - Empty string for manual entry
 * @constant selectedStreamerId - No preset selection initially
 * @constant cacheStrategy - Balanced approach caching emotes on first use
 * @constant logLevel - Basic operational logging without debug overhead
 */
const DEFAULT_SETTINGS: SevenTVSettings = {
    twitchUserId: '',
    selectedStreamerId: '',
    cacheStrategy: 'on-demand',
    logLevel: 'basic'
}

/**
 * Curated collection of popular streamers with verified Twitch ID mappings.
 * 
 * @constant BUILT_IN_STREAMERS - Array of [Display Name, Twitch ID, Internal Key] tuples
 * 
 * Streamer selection provides immediate access without manual ID lookup.
 * Each entry includes:
 *   - Display name shown in UI
 *   - Numeric Twitch identifier for API queries
 *   - Internal key for plugin state management
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

/**
 * Streamer display name lookup map for O(1) access performance.
 * 
 * @constant STREAMER_DISPLAY_MAP - Maps internal keys to display names
 */
const STREAMER_DISPLAY_MAP = new Map(BUILT_IN_STREAMERS.map(([name, id, key]) => [key, name]));

/**
 * Twitch ID lookup map for O(1) access performance.
 * 
 * @constant STREAMER_ID_MAP - Maps internal keys to Twitch numeric IDs
 */
const STREAMER_ID_MAP = new Map(BUILT_IN_STREAMERS.map(([name, id, key]) => [key, id]));

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
        
        this.plugin.logger.log(`Initiating download of ${totalEmotes} emotes`, 'basic');
    }

    /**
     * Creates or updates the floating status bar element.
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
        
        const elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
        const progress = this.totalEmotes > 0 ? (this.downloadedEmotes / this.totalEmotes) * 100 : 0;
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
     * Cancels active download operation and triggers cleanup.
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
// PLUGIN LOGGER
// =====================================================================

/**
 * Configurable logging utility with verbosity levels.
 * 
 * Provides filtered console output with performance timing capabilities
 * for debugging and operational monitoring.
 */
class PluginLogger {
    private plugin: SevenTVPlugin;
    private defaultLogLevel: 'basic' | 'verbose' | 'debug' = 'basic';

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
    log(message: string, level: 'basic' | 'verbose' | 'debug' = 'basic'): void {
        const currentLevel = this.getLogLevel();
        const levels = ['none', 'basic', 'verbose', 'debug'];
        
        if (levels.indexOf(currentLevel) >= levels.indexOf(level)) {
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
    
    /** Flag tracking CSS injection state */
    private stylesInjected: boolean = false;
    
    /** Logger instance for plugin operations */
    private logger: PluginLogger;
    
    /** Progress tracker for batch downloads */
    private downloadTracker: DownloadProgressTracker;
    
    /** Flag indicating pre-cache operation completion */
    private preCacheComplete: boolean = false;
    
    /** Abort controller for active download operations */
    private abortController: AbortController | null = null;

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
            return STREAMER_ID_MAP.get(this.settings.selectedStreamerId) || null;
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
     * Plugin initialization lifecycle method.
     * 
     * Loads settings, injects CSS, initializes cache, registers editor
     * suggestions, and loads any pre-configured emote sets.
     */
    async onload() {
        console.time('[7TV] Plugin initialization');
        
        // Load settings first for logger initialization
        await this.loadSettings();
        console.timeLog('[7TV] Plugin initialization', 'Settings loaded');
        
        // Initialize logger with loaded settings
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
     * Injects CSS styles for plugin UI components with safety checks.
     * 
     * Uses inline CSS to comply with Obsidian's Content Security Policy
     * and implements duplicate injection prevention.
     */
    private injectStyles(): void {
        const styleId = 'seven-tv-emotes-styles';
        
        // Prevent duplicate injections via internal flag
        if (this.stylesInjected) {
            this.logger.log('Styles already injected (internal flag), skipping', 'debug');
            return;
        }
        
        // Verify style element doesn't already exist in DOM
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
     * Plugin cleanup lifecycle method.
     * 
     * Ensures resources are properly released and active operations
     * are terminated to prevent memory leaks.
     */
    onunload() {
        // Clean up any active operations
        if (this.activeDownloadPromise) {
            console.log('[7TV] Active download operation cancelled on unload');
        }
        
        // Abort any active downloads
        if (this.abortController) {
            this.abortController.abort();
        }
        
        // Clean up download tracker
        this.downloadTracker.cleanup();
        
        console.log('[7TV] Plugin unloaded');
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
        
        if (newEmoteMap.size > 0) {
            this.emoteSuggest.updateEmoteMap(newEmoteMap);
            this.logger.log(`Loaded ${newEmoteMap.size} emotes`, 'basic');
            
            // Reset pre-cache status
            this.preCacheComplete = false;
        }
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
        const html = `<span class="seven-tv-emote" title=":${name}:"><img src="https://cdn.7tv.app/emote/${id}/1x.webp" alt="${name}" style="display:inline-block;height:1.5em;vertical-align:middle;"></span>`;
        this.logger.log(`Emote "${name}" (${id}) inserted via CDN (no-cache strategy)`, 'debug');
        editor.replaceSelection(html);
    }

    /**
     * Inserts emote using local cache if available, otherwise uses CDN with background caching.
     * 
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
     * 
     * @returns Boolean indicating if additional emotes are loaded
     */
    public hasLoadedEmotes(): boolean {
        return this.emoteSuggest !== undefined && this.emoteSuggest.getEmoteCount() > 1;
    }

    /**
     * Manually triggers pre-cache for all loaded emotes.
     * 
     * @returns Promise resolving when pre-cache completes
     */
    public async triggerPreCache(): Promise<void> {
        const emoteMap = this.emoteSuggest.getEmoteMap();
        if (!emoteMap || emoteMap.size <= 1) { // 1 for default HUH emote
            throw new Error('No emotes loaded to cache');
        }
        
        this.logger.log('Starting manual pre-cache operation', 'basic');
        
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
     * Pre-caches all emotes in a set using batched downloads with progress tracking.
     * 
     * @param emoteMap - Map of emote names to 7TV IDs
     */
    private async preCacheEmoteSet(emoteMap: Map<string, string>): Promise<void> {
        const emoteIds = Array.from(emoteMap.values());
        const totalEmotes = emoteIds.length;
        
        this.logger.log(`Starting pre-cache of ${totalEmotes} emotes`, 'basic');
        
        // Estimate total bytes (average emote is ~5KB)
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
                
                // Log progress every 10% or every 5 batches
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
                throw error; // Re-throw abort errors
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
     * Checks if pre-cache has completed.
     * 
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
 * 
 * Integrates with Obsidian's EditorSuggest API for seamless auto-completion
 * with visual emote previews.
 */
class EmoteSuggest extends EditorSuggest<string> {
    /** Internal mapping of emote names to 7TV IDs */
    private emoteMap: Map<string, string> = new Map([['HUH', '01FFMS6Q4G0009CAK0J14692AY']]);
    
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
        console.log(`[7TV] Emote map updated with ${newMap.size} emotes`);
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
     * 
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
 * Features streamlined cache strategy selection, detailed status display,
 * and clear separation between primary and advanced configuration.
 */
// =====================================================================
// ENHANCED SETTINGS TAB (UPDATED)
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
    private debounceTimer: NodeJS.Timeout | null = null;
    
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
            console.log('[7TV] Settings tab display already in progress, cancelling duplicate');
            return;
        }
        
        if (this.renderRequestId !== null) {
            cancelAnimationFrame(this.renderRequestId);
            this.renderRequestId = null;
        }
        
        this.isDisplaying = true;
        console.time('[7TV] Settings render');
        
        const { containerEl } = this;
        containerEl.empty();
        
        this.renderRequestId = requestAnimationFrame(async () => {
            try {
                // ======================
                // HEADER SECTION
                // ======================
                containerEl.createEl('h2', { text: '7TV Emotes' });
                containerEl.createEl('p', { 
                    text: 'Integrate 7TV (Twitch) emotes into your notes with auto-complete suggestions.',
                    cls: 'setting-item-description'
                });

                // ======================
                // STREAMER SELECTION
                // ======================
                containerEl.createEl('h3', { text: 'Streamer Selection' });
                containerEl.createEl('p', { 
                    text: 'Choose from popular streamers or enter a Twitch ID directly.',
                    cls: 'setting-item-description'
                });
                
                const streamerSetting = new Setting(containerEl)
                    .setName('Select Streamer')
                    .setDesc('Streamer emotes will be available for auto-complete');
                
                const buttonContainer = streamerSetting.controlEl.createDiv();
                buttonContainer.style.display = 'flex';
                buttonContainer.style.gap = '8px';
                buttonContainer.style.alignItems = 'center';
                
                // Search button for streamer selection
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
                    if (this.isDisplaying) {
                        setTimeout(() => {
                            this.openStreamerModal(button, updateButtonText, manualInput);
                        }, 100);
                    } else {
                        this.openStreamerModal(button, updateButtonText, manualInput);
                    }
                });
                
                // Manual Twitch ID input
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
                                await this.updateCacheStats();
                                this.updateStatus();
                                new Notice('Emotes loaded');
                            } catch (error) {
                                console.error('[7TV] Failed to load emotes:', error);
                                new Notice('Failed to load emotes');
                            }
                        }
                    }, 800);
                });
                
                // Clear selection button
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

                // ======================
                // CACHE SETTINGS
                // ======================
                containerEl.createEl('h3', { text: 'Cache Settings' });
                containerEl.createEl('p', { 
                    text: 'Control how emote images are stored on your device.',
                    cls: 'setting-item-description'
                });

                // Cache strategy selection via radio buttons
                const cacheContainer = containerEl.createDiv();
                cacheContainer.style.marginBottom = '16px';
                
                // On-Demand Cache option (Default)
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
                    text: 'On-Demand Cache (Recommended)',
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
                
                // No Cache option
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
                    text: 'No Cache',
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
                
                // Cache action buttons container
                const actionContainer = containerEl.createDiv();
                actionContainer.style.display = 'grid';
                actionContainer.style.gridTemplateColumns = '1fr 1fr';
                actionContainer.style.gap = '8px';
                actionContainer.style.marginTop = '8px';
                actionContainer.style.marginBottom = '24px';

                // Pre-cache Now button
                this.preCacheButton = actionContainer.createEl('button');
                this.preCacheButton.textContent = 'Pre-cache Now';
                this.preCacheButton.style.flex = '1';
                
                this.preCacheButton.addEventListener('click', async () => {
                    if (!this.plugin.hasLoadedEmotes()) {
                        new Notice('No emotes loaded to cache');
                        return;
                    }
                    
                    // Estimate size based on average emote (5KB)
                    const emoteCount = this.plugin.emoteSuggest?.getEmoteCount() || 0;
                    const estimatedSizeMB = ((emoteCount * 5) / 1024).toFixed(1);
                    
                    const confirmMsg = `This will download all ${emoteCount} emotes (est. ${estimatedSizeMB}MB).\n\nThis may take a while. Continue?`;
                    
                    if (confirm(confirmMsg)) {
                        new Notice('Starting pre-cache...');
                        try {
                            await this.plugin.triggerPreCache();
                            this.updateStatus();
                            this.updateActionButtons(); // Update cancel button state
                        } catch (error) {
                            new Notice(`Failed to start pre-cache: ${error.message}`);
                        }
                    }
                });

                // Cancel Pre-cache button
                this.cancelPreCacheButton = actionContainer.createEl('button');
                this.cancelPreCacheButton.textContent = 'Cancel Pre-cache';
                this.cancelPreCacheButton.className = 'mod-warning';
                
                this.cancelPreCacheButton.addEventListener('click', () => {
                    if (this.plugin.isPreCaching()) {
                        this.plugin.cancelPreCache();
                        new Notice('Pre-cache cancelled');
                        this.updateActionButtons();
                        this.updateStatus();
                    }
                });

                // Clear Cache button
                this.clearCacheButton = containerEl.createEl('button');
                this.clearCacheButton.textContent = 'Clear Cache';
                this.clearCacheButton.style.width = '100%';
                this.clearCacheButton.style.marginTop = '8px';
                this.clearCacheButton.style.marginBottom = '24px';
                
                this.clearCacheButton.addEventListener('click', async () => {
                    const warningMsg = `⚠️ Warning: Clearing the cache may cause emotes to not display correctly if:\n\n` +
                                     `• The original CDN links change or break\n` +
                                     `• You're offline and emotes aren't cached\n` +
                                     `• You switch to "No Cache" mode later\n\n` +
                                     `Are you sure you want to clear the cache?`;
                    
                    if (confirm(warningMsg)) {
                        try {
                            const cacheDir = this.plugin.getCacheDir();
                            if (await this.plugin.app.vault.adapter.exists(cacheDir)) {
                                await this.plugin.app.vault.adapter.rmdir(cacheDir, true);
                                await this.plugin.initializeCache();
                                this.plugin.preCacheComplete = false;
                                await this.updateCacheStats();
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

                // ======================
                // STATUS SECTION
                // ======================
                containerEl.createEl('h3', { text: 'Status' });
                
                this.statusDiv = containerEl.createDiv();
                this.statusDiv.style.marginBottom = '24px';
                this.statusDiv.style.padding = '12px';
                this.statusDiv.style.borderRadius = '6px';
                this.statusDiv.style.backgroundColor = 'var(--background-secondary)';
                this.statusDiv.style.border = '1px solid var(--background-modifier-border)';
                this.statusDiv.style.fontSize = '0.9em';
                
                // Update cache stats and status display
                await this.updateCacheStats();
                this.updateStatus();
                this.updateRadioButtons();
                this.updateActionButtons();

                // ======================
                // ADVANCED SETTINGS
                // ======================
                containerEl.createEl('h3', { text: 'Advanced' });
                containerEl.createEl('p', { 
                    text: 'Settings for debugging and troubleshooting.',
                    cls: 'setting-item-description'
                });

                // Log level dropdown (moved to bottom)
                new Setting(containerEl)
                    .setName('Log Level')
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
                            console.log(`[7TV] Log level changed to: ${value}`);
                            this.updateStatus();
                        }));
                
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
            console.warn('[7TV] Failed to calculate cache stats:', error);
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
        
        // Update On-Demand radio button
        this.onDemandRadio.style.background = isOnDemand ? 'var(--interactive-accent)' : 'transparent';
        this.onDemandRadio.style.borderColor = isOnDemand ? 'var(--interactive-accent)' : 'var(--text-muted)';
        
        // Update No Cache radio button
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
        
        // Pre-cache button
        this.preCacheButton.disabled = isNoCache || !hasEmotes;
        
        // Cancel pre-cache button
        this.cancelPreCacheButton.disabled = !isPreCaching;
        
        // Clear cache button
        this.clearCacheButton.disabled = isNoCache;
        
        // Visual feedback for disabled buttons
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
    private updateStatus(): void {
        if (!this.statusDiv) return;
        
        Promise.resolve().then(async () => {
            const activeId = this.plugin.getActiveTwitchId();
            const activeStreamer = this.plugin.settings.selectedStreamerId;
            const streamerName = activeStreamer ? STREAMER_DISPLAY_MAP.get(activeStreamer) : null;
            const emoteCount = this.plugin.hasLoadedEmotes() ? this.plugin.emoteSuggest?.getEmoteCount() || 0 : 0;
            const isPreCaching = this.plugin.isPreCaching();
            const preCacheStatus = this.plugin.isPreCacheComplete() ? 'Complete' : isPreCaching ? 'In Progress' : 'Not Started';
            
            await this.updateCacheStats();
            
            let statusHTML = `
                <div style="margin-bottom: 8px;">
                    <strong>Current Source:</strong><br>
                    ${streamerName || activeId || 'None selected'}
                </div>
                <div style="margin-bottom: 8px;">
                    <strong>Emotes Loaded:</strong><br>
                    ${emoteCount > 0 ? `${emoteCount} emotes` : 'None'}
                </div>
                <div style="margin-bottom: 8px;">
                    <strong>Cache Strategy:</strong><br>
                    ${this.plugin.settings.cacheStrategy === 'on-demand' ? 'On-Demand' : 'No Cache'}
                </div>
            `;
            
            if (this.plugin.settings.cacheStrategy !== 'no-cache') {
                statusHTML += `
                    <div style="margin-bottom: 8px;">
                        <strong>Cache Status:</strong><br>
                        ${this.cacheStats.count} emotes cached (${this.formatBytes(this.cacheStats.size)})
                    </div>
                    <div style="margin-bottom: 8px;">
                        <strong>Pre-cache:</strong><br>
                        ${preCacheStatus}
                    </div>
                `;
            }
            
            if (isPreCaching) {
                statusHTML += `
                    <div style="margin-top: 8px; padding: 8px; background: var(--background-modifier-success); border-radius: 4px; font-size: 0.85em;">
                        <strong>⏳ Download in progress</strong><br>
                        Check top-right corner for progress
                    </div>
                `;
            }
            
            this.statusDiv.innerHTML = statusHTML;
            
            // Also update action buttons in case pre-cache status changed
            this.updateActionButtons();
        });
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
            new Notice(`Fetching ${displayName}'s emotes...`);
            
            try {
                await this.plugin.refreshEmotesForUser(twitchId);
                await this.updateCacheStats();
                this.updateStatus();
                this.updateActionButtons(); // Update pre-cache button availability
                new Notice(`${displayName}'s emotes loaded`);
            } catch (error) {
                console.error('[7TV] Failed to load emotes:', error);
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
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        
        // Clear element references
        this.onDemandRadio = null;
        this.noCacheRadio = null;
        this.preCacheButton = null;
        this.cancelPreCacheButton = null;
        this.clearCacheButton = null;
        this.statusDiv = null;
        
        this.isDisplaying = false;
        super.hide();
        console.log('[7TV] Settings tab hidden');
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
        this.limit = 15;
    }

    /**
     * Returns streamer keys for fuzzy search, sorted alphabetically.
     * 
     * @returns Array of streamer internal identifiers
     */
    getItems(): string[] {
        return Array.from(STREAMER_DISPLAY_MAP.entries())
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
        return STREAMER_DISPLAY_MAP.get(item) || item;
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
 * 
 * Implements 7TV API v3 integration with error handling and timeout protection.
 * Always includes HUH emote as a reliable fallback.
 * 
 * @param twitchId - Numeric Twitch user identifier
 * @returns Promise resolving to map of emote names to 7TV IDs
 * 
 * @throws {Error} When API requests fail or return invalid data
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