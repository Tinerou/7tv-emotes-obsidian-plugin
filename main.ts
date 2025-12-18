/**
 * 7TV Emotes for Obsidian - Fixed Auto-Suggest & Enhanced Settings
 * 
 * @version 1.4.0
 * @license MIT
 */
import { 
    App, Editor, EditorSuggest, EditorPosition, 
    EditorSuggestContext, EditorSuggestTriggerInfo, 
    Plugin, PluginSettingTab, Setting, Notice
} from 'obsidian';

// =====================================================================
// SECTION 1: ENHANCED SETTINGS INTERFACE AND DEFAULTS
// =====================================================================

/**
 * Defines the enhanced structure for the plugin's persistent settings.
 * 
 * @property twitchUserId - The numeric Twitch ID used to fetch a streamer's
 * 7TV emote set. Can be manually entered or populated from streamer selection.
 * @property selectedStreamerId - The internal identifier from the built-in
 * streamer list (e.g., "xqc"). Used to populate the twitchUserId automatically.
 * @property cacheStrategy - Controls how and when emote images are cached locally.
 */
interface SevenTVSettings {
    twitchUserId: string;
    selectedStreamerId: string;
    cacheStrategy: 'pre-cache' | 'on-demand' | 'no-cache';
}

/**
 * Default settings values for new plugin installations.
 * 
 * @note 'on-demand' is set as default for optimal balance of performance
 * and storage efficiency.
 */
const DEFAULT_SETTINGS: SevenTVSettings = {
    twitchUserId: '',
    selectedStreamerId: '',
    cacheStrategy: 'on-demand'  // Default changed to 'on-demand' per requirement
}

/**
 * Database of popular streamers for easy selection.
 * Structure: [Display Name, Twitch Numeric ID, Internal Identifier]
 * 
 * To add more streamers:
 * 1. Find the streamer's numeric Twitch ID (not username)
 * 2. Add a new entry: ['Display Name', 'TwitchID', 'internal_key']
 * 3. internal_key should be lowercase and unique
 */
const BUILT_IN_STREAMERS: Array<[string, string, string]> = [
    ['xQc', '71092938', 'xqc'],
    ['Forsen', '22484632', 'forsen'],
    ['Mizkif', '34161162', 'mizkif'],
    ['Pokimane', '217592995', 'pokimane'],
    ['Shroud', '37402157', 'shroud'],
    ['Tfue', '108899889', 'tfue'],
    ['Ninja', '19571641', 'ninja'],
    ['Asmongold', '26490481', 'asmongold'],
    ['Ludwig', '50615467', 'ludwig'],
    ['HasanAbi', '15796662', 'hasanabi'],
    // Add more streamers here following the same format
];

// Create lookup maps for efficient access
const STREAMER_DISPLAY_MAP = new Map(BUILT_IN_STREAMERS.map(([name, id, key]) => [key, name]));
const STREAMER_ID_MAP = new Map(BUILT_IN_STREAMERS.map(([name, id, key]) => [key, id]));

// =====================================================================
// SECTION 2: ENHANCED MAIN PLUGIN CLASS
// =====================================================================

export default class SevenTVPlugin extends Plugin {
    settings: SevenTVSettings;
    private emoteSuggest: EmoteSuggest;
    private cacheDir: string = '_7tv-emotes-cache';
    private activePreCachePromise: Promise<void> | null = null;
    
    /**
     * Returns the currently active Twitch ID for fetching emotes.
     * Priority order: Manual Twitch ID > Selected built-in streamer.
     * 
     * @returns The active Twitch ID or null if none is configured
     */
    getActiveTwitchId(): string | null {
        // Manual ID takes precedence
        if (this.settings.twitchUserId.trim()) {
            console.log(`[7TV] Using manual Twitch ID: ${this.settings.twitchUserId}`);
            return this.settings.twitchUserId.trim();
        }
        
        // Fall back to built-in streamer
        if (this.settings.selectedStreamerId) {
            const builtInId = STREAMER_ID_MAP.get(this.settings.selectedStreamerId);
            if (builtInId) {
                console.log(`[7TV] Using built-in streamer: ${this.settings.selectedStreamerId} (ID: ${builtInId})`);
                return builtInId;
            }
        }
        
        console.log('[7TV] No active Twitch ID configured.');
        return null;
    }

    async onload() {
        await this.loadSettings();
        console.log(`[7TV] Plugin loading with cache strategy: ${this.settings.cacheStrategy}`);
        
        // Initialize cache if needed
        if (this.settings.cacheStrategy !== 'no-cache') {
            await this.initializeCache();
        }
        
        // Initialize auto-complete engine
        this.emoteSuggest = new EmoteSuggest(this.app, this);
        this.registerEditorSuggest(this.emoteSuggest);
        console.log('[7TV] Auto-complete engine registered');

        // Fetch emotes if an ID is configured
        const activeId = this.getActiveTwitchId();
        if (activeId) {
            await this.refreshEmotesForUser(activeId);
        }

        // Add manual insertion command (fallback)
        this.addCommand({
            id: 'insert-huh-emote-manual',
            name: 'Insert HUH emote (Manual Fallback)',
            editorCallback: async (editor: Editor) => {
                await this.insertEmoteByStrategy(editor, 'HUH', '01FFMS6Q4G0009CAK0J14692AY');
            }
        });

        // Register enhanced settings tab
        this.addSettingTab(new EnhancedSettingTab(this.app, this));
        console.log('[7TV] Plugin loaded successfully.');
    }

    // ======================
    // AUTO-SUGGEST FIXES
    // ======================

    /**
     * Called when the plugin is disabled. Cleans up resources.
     */
    onunload() {
        console.log('[7TV] Plugin unloaded.');
    }

    // ======================
    // ENHANCED CACHE SYSTEM
    // ======================

    /**
     * Centralized method to refresh emotes for a given Twitch ID.
     * Applies the user's selected cache strategy automatically.
     * 
     * @param twitchId - The Twitch numeric ID to fetch emotes for
     */
    async refreshEmotesForUser(twitchId: string): Promise<void> {
        console.log(`[7TV] Fetching emotes for Twitch ID: ${twitchId}`);
        const newEmoteMap = await fetchEmotesForTwitchId(twitchId);

        if (newEmoteMap.size > 0) {
            this.emoteSuggest.updateEmoteMap(newEmoteMap);
            console.log(`[7TV] Loaded ${newEmoteMap.size} emotes. Cache strategy: ${this.settings.cacheStrategy}`);
            
            // Apply the selected cache strategy
            switch (this.settings.cacheStrategy) {
                case 'pre-cache':
                    this.activePreCachePromise = this.preCacheEmoteSet(newEmoteMap);
                    this.activePreCachePromise
                        .then(() => console.log('[7TV] Pre-cache completed successfully.'))
                        .catch(err => console.warn('[7TV] Pre-cache encountered errors:', err))
                        .finally(() => { this.activePreCachePromise = null; });
                    break;
                    
                case 'on-demand':
                    console.log('[7TV] On-demand caching enabled. Emotes will cache when first used.');
                    break;
                    
                case 'no-cache':
                    console.log('[7TV] Caching disabled. All emotes will load from 7TV CDN.');
                    break;
            }
        }
    }

    /**
     * Main emote insertion method that respects the active cache strategy.
     * Routes to the appropriate insertion method based on cacheStrategy setting.
     * 
     * @param editor - The active editor instance
     * @param name - Display name of the emote (e.g., 'HUH')
     * @param id - 7TV emote ID
     */
    async insertEmoteByStrategy(editor: Editor, name: string, id: string): Promise<void> {
        switch (this.settings.cacheStrategy) {
            case 'no-cache':
                await this.insertWithoutCache(editor, name, id);
                break;
                
            case 'on-demand':
                await this.insertWithOnDemandCache(editor, name, id);
                break;
                
            case 'pre-cache':
            default:
                await this.insertWithPreCache(editor, name, id);
                break;
        }
    }

    /**
     * Strategy: No Cache - Always use CDN URLs directly.
     * Provides fastest initial load but no offline support.
     * 
     * @param editor - The active editor instance
     * @param name - Display name of the emote
     * @param id - 7TV emote ID
     */
    private async insertWithoutCache(editor: Editor, name: string, id: string): Promise<void> {
        const html = `<span class="seven-tv-emote" title=":${name}:"> <img src="https://cdn.7tv.app/emote/${id}/1x.webp" alt="${name}" style="display: inline-block; height: 1.5em; vertical-align: middle;"> </span>`;
        editor.replaceSelection(html);
        console.log(`[7TV] Inserted (no-cache): :${name}: from CDN`);
    }

    /**
     * Strategy: On-Demand Cache - Lazy loading with background caching.
     * Default strategy that balances performance and storage efficiency.
     * 
     * @param editor - The active editor instance
     * @param name - Display name of the emote
     * @param id - 7TV emote ID
     */
    private async insertWithOnDemandCache(editor: Editor, name: string, id: string): Promise<void> {
        const cachePath = `${this.cacheDir}/${id}.webp`;
        const cdnUrl = `https://cdn.7tv.app/emote/${id}/1x.webp`;
        
        // Check if already cached
        if (await this.app.vault.adapter.exists(cachePath)) {
            const html = `<span class="seven-tv-emote" title=":${name}:"> <img src="./${cachePath}" alt="${name}" style="display: inline-block; height: 1.5em; vertical-align: middle;"> </span>`;
            editor.replaceSelection(html);
            console.log(`[7TV] Inserted (on-demand cache): :${name}: from local cache`);
        } else {
            // Use CDN first for immediate feedback, then cache in background
            const html = `<span class="seven-tv-emote" title=":${name}:"> <img src="${cdnUrl}" alt="${name}" style="display: inline-block; height: 1.5em; vertical-align: middle;"> </span>`;
            editor.replaceSelection(html);
            console.log(`[7TV] Inserted (on-demand cache): :${name}: from CDN, caching in background`);
            
            // Cache in background for next time (fire-and-forget)
            this.downloadToCache(id, cdnUrl, cachePath).catch(err => 
                console.debug(`[7TV] Background cache failed for ${name}:`, err)
            );
        }
    }

    /**
     * Strategy: Pre-Cache - Assumes emotes are already cached.
     * Provides instant loading and full offline support after initial cache.
     * 
     * @param editor - The active editor instance
     * @param name - Display name of the emote
     * @param id - 7TV emote ID
     */
    private async insertWithPreCache(editor: Editor, name: string, id: string): Promise<void> {
        const cachePath = `${this.cacheDir}/${id}.webp`;
        const cdnUrl = `https://cdn.7tv.app/emote/${id}/1x.webp`;
        
        if (await this.app.vault.adapter.exists(cachePath)) {
            const html = `<span class="seven-tv-emote" title=":${name}:"> <img src="./${cachePath}" alt="${name}" style="display: inline-block; height: 1.5em; vertical-align: middle;"> </span>`;
            editor.replaceSelection(html);
            console.log(`[7TV] Inserted (pre-cache): :${name}: from local cache`);
        } else {
            // Fallback to CDN if somehow not cached (should be rare with pre-cache)
            console.warn(`[7TV] Pre-cache miss for ${name}, using CDN fallback`);
            const html = `<span class="seven-tv-emote" title=":${name}:"> <img src="${cdnUrl}" alt="${name}" style="display: inline-block; height: 1.5em; vertical-align: middle;"> </span>`;
            editor.replaceSelection(html);
            
            // Try to cache it now for next time
            this.downloadToCache(id, cdnUrl, cachePath).catch(err => 
                console.debug(`[7TV] Cache fallback failed for ${name}:`, err)
            );
        }
    }

    // ======================
    // CACHE INFRASTRUCTURE (Shared)
    // ======================

    /**
     * Initializes the cache directory in the vault.
     * Only creates directory if caching is enabled in settings.
     */
    private async initializeCache(): Promise<void> {
        try {
            const exists = await this.app.vault.adapter.exists(this.cacheDir);
            if (!exists) {
                await this.app.vault.createFolder(this.cacheDir);
                console.log(`[7TV] Cache directory created: ${this.cacheDir}`);
            }
        } catch (error) {
            console.error('[7TV] Cache initialization error:', error);
        }
    }

	public async ensureCacheInitialized(): Promise<void> {
		if (this.settings.cacheStrategy !== 'no-cache') {
			await this.initializeCache();
		}
	}

	public hasLoadedEmotes(): boolean {
		return this.emoteSuggest !== undefined && this.emoteSuggest.getEmoteCount() > 1; // >1 because HUH is always there
	}

    /**
     * Pre-caches an entire emote set for the pre-cache strategy.
     * Downloads emotes in small batches to avoid overwhelming network/file system.
     * 
     * @param emoteMap - The full map of emote names to IDs to cache
     */
    private async preCacheEmoteSet(emoteMap: Map<string, string>): Promise<void> {
        const emoteIds = Array.from(emoteMap.values());
        console.log(`[7TV] Starting pre-cache of ${emoteIds.length} emotes...`);
        
        const BATCH_SIZE = 5;
        let successCount = 0;
        
        for (let i = 0; i < emoteIds.length; i += BATCH_SIZE) {
            const batch = emoteIds.slice(i, i + BATCH_SIZE);
            const promises = batch.map(id => this.ensureEmoteCached(id));
            const results = await Promise.allSettled(promises);
            
            successCount += results.filter(r => r.status === 'fulfilled').length;
            
            // Progress reporting for large sets
            if (emoteIds.length > 30 && i % 30 === 0) {
                console.log(`[7TV] Pre-cache progress: ${successCount}/${emoteIds.length}`);
            }
            
            // Small delay between batches to be network-friendly
            await new Promise(resolve => setTimeout(resolve, 30));
        }
        
        console.log(`[7TV] Pre-cache finished. ${successCount}/${emoteIds.length} emotes cached.`);
    }

    /**
     * Ensures a specific emote is cached locally.
     * Skips download if already cached.
     * 
     * @param emoteId - The 7TV emote ID to cache
     */
    private async ensureEmoteCached(emoteId: string): Promise<void> {
        const cachePath = `${this.cacheDir}/${emoteId}.webp`;
        if (await this.app.vault.adapter.exists(cachePath)) {
            return; // Already cached
        }
        
        const cdnUrl = `https://cdn.7tv.app/emote/${emoteId}/1x.webp`;
        await this.downloadToCache(emoteId, cdnUrl, cachePath);
    }

    /**
     * Downloads an emote from 7TV CDN and saves it to the local cache.
     * 
     * @param emoteId - The 7TV emote ID (for logging)
     * @param sourceUrl - The CDN URL to download from
     * @param destPath - The local path to save the file to
     */
    private async downloadToCache(emoteId: string, sourceUrl: string, destPath: string): Promise<void> {
        try {
            const response = await fetch(sourceUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const arrayBuffer = await response.arrayBuffer();
            await this.app.vault.adapter.writeBinary(destPath, arrayBuffer);
            console.log(`[7TV] Cached emote: ${emoteId} (${arrayBuffer.byteLength} bytes)`);
        } catch (error) {
            console.debug(`[7TV] Cache download failed for ${emoteId}:`, error);
            throw error;
        }
    }

    /**
     * Loads plugin settings from persistent storage.
     */
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        console.log('[7TV] Settings loaded.');
    }

    /**
     * Saves plugin settings to persistent storage.
     */
    async saveSettings() {
        await this.saveData(this.settings);
        console.log('[7TV] Settings saved.');
    }
}

// =====================================================================
// SECTION 3: FIXED AUTO-COMPLETE ENGINE (EditorSuggest)
// =====================================================================

/**
 * The auto-complete engine that provides emote suggestions as users type.
 * 
 * Key features:
 * - Triggers on colon (:) character
 * - Shows emote images and names in suggestions
 * - Enhanced to trigger on both partial and complete emote codes
 * - Handles emote insertion with caching support
 */
class EmoteSuggest extends EditorSuggest<string> {
    /** Map of emote names to their 7TV IDs */
    private emoteMap: Map<string, string> = new Map([['HUH', '01FFMS6Q4G0009CAK0J14692AY']]);
    
    /** Reference to main plugin for cache access */
    private plugin: SevenTVPlugin;

    /**
     * Creates a new EmoteSuggest instance.
     * 
     * @param app - The Obsidian App instance
     * @param plugin - Reference to main plugin for cache access
     */
    constructor(app: App, plugin: SevenTVPlugin) {
        super(app);
        this.plugin = plugin;
        console.log('[7TV] EmoteSuggest engine initialized.');
    }

    // ======================
    // EMOTE MAP MANAGEMENT
    // ======================

    /**
     * Updates the internal emote map with new data.
     * 
     * @param newMap - The new map of emote names to IDs
     */
    updateEmoteMap(newMap: Map<string, string>): void {
        this.emoteMap = new Map(newMap);
        console.log(`[7TV] Suggester updated with ${this.emoteMap.size} emotes.`);
    }

    /**
     * Retrieves the 7TV ID for a given emote name.
     * 
     * @param emoteName - The name of the emote (e.g., 'HUH')
     * @returns The 7TV ID if found, undefined otherwise
     */
    getEmoteId(emoteName: string): string | undefined {
        return this.emoteMap.get(emoteName);
    }

    // ======================
    // EDITORSUGGEST IMPLEMENTATION - FIXED
    // ======================

    /**
     * Determines when to trigger the suggestion popup.
     * 
     * FIXED REGEX: Now properly detects patterns like ":emote" and ":emote:"
     * The regex /:([a-zA-Z0-9_]+):?$/ matches:
     * - Colon followed by alphanumeric/underscore characters
     * - Optional trailing colon
     * - At the end of the current text (cursor position)
     * 
     * @param cursor - Current cursor position in the editor
     * @param editor - The active editor instance
     * @returns Trigger information or null if no trigger detected
     */
    onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {
        const line = editor.getLine(cursor.line);
        const sub = line.substring(0, cursor.ch);
        
        // FIXED: Use regex that properly matches ":emote" and ":emote:"
        const match = sub.match(/:([a-zA-Z0-9_]+):?$/);
        
        if (match) {
            // match[0] is the full match (e.g., ":HUH" or ":HUH:")
            // match[1] is the captured group (the emote name without colons)
            const fullMatch = match[0];
            const query = match[1]; // The emote name without colons
            
            // Calculate start position (location of the first colon)
            const startPos = cursor.ch - fullMatch.length;
            
            // Check if we have a trailing colon
            const hasTrailingColon = fullMatch.endsWith(':');
            
            console.log(`[7TV] Trigger detected: query="${query}", fullMatch="${fullMatch}", hasTrailingColon=${hasTrailingColon}`);
            
            return {
                start: { line: cursor.line, ch: Math.max(0, startPos) },
                end: cursor,
                query: query
            };
        }
        
        return null;
    }

    /**
     * Generates the list of suggestions based on the user's query.
     * 
     * @param context - The suggestion context containing the user's query
     * @returns Array of emote names that match the query
     */
    getSuggestions(context: EditorSuggestContext): string[] {
        const query = context.query.toLowerCase();
        const suggestions = Array.from(this.emoteMap.keys())
            .filter(name => name.toLowerCase().includes(query))
            .slice(0, 25); // Limit to 25 suggestions for performance
        
        console.log(`[7TV] Generated ${suggestions.length} suggestions for query: "${query}"`);
        return suggestions;
    }

    /**
     * Renders a single suggestion in the popup list.
     * 
     * Displays both the emote image and its code for easy identification.
     * 
     * @param value - The emote name being rendered
     * @param el - The HTML element to render the suggestion into
     */
    renderSuggestion(value: string, el: HTMLElement): void {
        // Clear any existing content
        el.empty();

        // Create container for the suggestion
        const container = el.createDiv();
        container.addClass('seven-tv-suggestion-item');
        
        // Get the emote ID and create image if available
        const emoteId = this.emoteMap.get(value);
        if (emoteId) {
            const imgUrl = `https://cdn.7tv.app/emote/${emoteId}/1x.webp`;
            const imgEl = container.createEl('img');
            imgEl.setAttribute('src', imgUrl);
            imgEl.setAttribute('alt', value);
            imgEl.addClass('seven-tv-suggestion-img');
            imgEl.setAttribute('data-emote-name', value);
            
            // Style the image for consistent display
            imgEl.style.height = '1.5em';
            imgEl.style.verticalAlign = 'middle';
            imgEl.style.marginRight = '0.5em';
            imgEl.style.borderRadius = '3px';
        }
        
        // Add the emote code as text
        const textSpan = container.createEl('span');
        textSpan.setText(`:${value}:`);
        textSpan.addClass('seven-tv-suggestion-text');
        textSpan.style.verticalAlign = 'middle';
        textSpan.style.color = 'var(--text-muted)';
        textSpan.style.fontFamily = 'var(--font-monospace)';
        textSpan.style.fontSize = '0.9em';
        
        console.log(`[7TV] Rendered suggestion for: :${value}:`);
    }

    /**
     * Handles the selection of a suggestion from the popup.
     * 
     * Replaces the typed text with the cached emote HTML.
     * Uses the plugin's strategy-based insertion method.
     * 
     * @param value - The selected emote name
     * @param evt - The mouse or keyboard event that triggered the selection
     */
    selectSuggestion(value: string, evt: MouseEvent | KeyboardEvent): void {
        if (!this.context || !this.context.editor) {
            console.error('[7TV] Cannot select suggestion: missing context or editor');
            return;
        }

        const editor = this.context.editor;
        const emoteId = this.emoteMap.get(value);

        if (!emoteId) {
            console.error(`[7TV] Cannot find ID for emote: ${value}`);
            return;
        }

        // Get the text that was actually typed
        const typedRange = editor.getRange(this.context.start, this.context.end);
        const hasTrailingColon = typedRange.endsWith(':');
        
        // Adjust end position to delete trailing colon if present
        let deleteEnd = this.context.end;
        if (hasTrailingColon && this.context.end.ch > this.context.start.ch) {
            deleteEnd = { ...this.context.end };
        }

        // Delete the typed text (e.g., ":HUH" or ":HUH:")
        editor.replaceRange('', this.context.start, deleteEnd);
        
        // Use plugin's strategy-based insertion method
        this.plugin.insertEmoteByStrategy(editor, value, emoteId);
    }
	getEmoteCount(): number {
		return this.emoteMap.size;
	}
}

// =====================================================================
// SECTION 4: ENHANCED SETTINGS TAB WITH FIXED STREAMER SELECTION
// =====================================================================

class EnhancedSettingTab extends PluginSettingTab {
    plugin: SevenTVPlugin;

    constructor(app: App, plugin: SevenTVPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    /**
     * Renders the settings tab interface with enhanced streamer selection.
     * Built-in streamer selection now populates the manual Twitch ID field.
     */
    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: '7TV Emotes - Settings' });
        
        // Cache Strategy Selection
        new Setting(containerEl)
            .setName('Cache Strategy')
            .setDesc('Controls how and when emote images are stored locally.')
            .addDropdown(dropdown => dropdown
                .addOption('pre-cache', 'Pre-cache All (Offline Ready)')
                .addOption('on-demand', 'Cache On-Demand (Recommended)')
                .addOption('no-cache', 'No Cache (CDN Only)')
                .setValue(this.plugin.settings.cacheStrategy)
                .onChange(async (value: any) => {
                    this.plugin.settings.cacheStrategy = value;
                    await this.plugin.saveSettings();
                    console.log(`[7TV] Cache strategy changed to: ${value}`);
                    
                    // Re-initialize cache if needed
                    if (value !== 'no-cache') {
                        await this.plugin.ensureCacheInitialized();
                    }
                }));
        
        // Built-in Streamer Selection (Searchable Dropdown)
        new Setting(containerEl)
            .setName('Select Streamer')
            .setDesc('Choose from popular streamers. This will populate the Twitch ID field.')
            .addDropdown(dropdown => {
                // Add blank option
                dropdown.addOption('', '-- Select a Streamer --');
                
                // Sort streamers alphabetically by display name
                const sortedStreamers = [...BUILT_IN_STREAMERS]
                    .sort((a, b) => a[0].localeCompare(b[0]));
                
                // Add all streamers
                sortedStreamers.forEach(([displayName, _, key]) => {
                    dropdown.addOption(key, displayName);
                });
                
                dropdown.setValue(this.plugin.settings.selectedStreamerId)
                    .onChange(async (value) => {
                        this.plugin.settings.selectedStreamerId = value;
                        
                        // FIXED: Populate the manual Twitch ID field with the selected streamer's ID
                        if (value) {
                            const twitchId = STREAMER_ID_MAP.get(value);
                            if (twitchId) {
                                this.plugin.settings.twitchUserId = twitchId;
                                // Force the manual ID field to update visually
                                const manualInput = containerEl.querySelector('input[placeholder*="Twitch ID"]') as HTMLInputElement;
                                if (manualInput) {
                                    manualInput.value = twitchId;
                                }
                            }
                        } else {
                            // Clear both if no streamer selected
                            this.plugin.settings.twitchUserId = '';
                        }
                        
                        await this.plugin.saveSettings();
                        
                        // Refresh emotes if a streamer was selected
                        if (value) {
                            const streamerName = STREAMER_DISPLAY_MAP.get(value) || value;
                            new Notice(`Fetching 7TV emotes for ${streamerName}...`);
                            const twitchId = STREAMER_ID_MAP.get(value);
                            if (twitchId) {
                                this.plugin.refreshEmotesForUser(twitchId)
                                    .then(() => new Notice(`Loaded ${streamerName}'s emotes!`))
                                    .catch(err => {
                                        console.error('[7TV] Failed to load emotes:', err);
                                        new Notice(`Failed to load ${streamerName}'s emotes. Check console.`);
                                    });
                            }
                        }
                    });
            });
        
        // Manual Twitch ID Input
        const manualSetting = new Setting(containerEl)
            .setName('Twitch User ID')
            .setDesc('The numeric Twitch ID. Can be entered manually or populated by selecting a streamer above.')
            .addText(text => text
                .setPlaceholder('e.g., 71092938')
                .setValue(this.plugin.settings.twitchUserId)
                .onChange(async (value) => {
                    this.plugin.settings.twitchUserId = value;
                    
                    // Clear streamer selection if manual ID is entered
                    if (value.trim() && this.plugin.settings.selectedStreamerId) {
                        this.plugin.settings.selectedStreamerId = '';
                        // Force the streamer dropdown to update visually
                        const streamerDropdown = containerEl.querySelector('select') as HTMLSelectElement;
                        if (streamerDropdown) {
                            streamerDropdown.value = '';
                        }
                    }
                    
                    await this.plugin.saveSettings();
                    
                    // Auto-fetch if ID looks valid
                    if (/^\d+$/.test(value.trim()) && value.trim().length > 5) {
                        new Notice('Fetching 7TV emotes...');
                        this.plugin.refreshEmotesForUser(value.trim())
                            .then(() => new Notice('Emotes loaded successfully!'))
                            .catch(err => {
                                console.error('[7TV] Failed to load emotes:', err);
                                new Notice('Failed to load emotes. Check console.');
                            });
                    }
                }));
        
        // Info text explaining the settings
        const infoDiv = containerEl.createDiv();
        infoDiv.addClass('setting-item-description');
        infoDiv.style.marginTop = '-10px';
        infoDiv.style.marginBottom = '20px';
        infoDiv.style.fontSize = '0.85em';
        infoDiv.style.color = 'var(--text-muted)';
        infoDiv.innerHTML = `
            <strong>Usage:</strong><br>
            1. Select a streamer from the dropdown OR enter a Twitch ID manually.<br>
            2. The plugin will automatically fetch and cache their 7TV emotes.<br>
            3. In notes, type <code>:emote_name:</code> to trigger auto-complete.<br>
            <br>
            <strong>Cache Strategies:</strong><br>
            • <strong>Pre-cache</strong>: Downloads all emotes upfront (best for offline).<br>
            • <strong>On-Demand</strong>: Caches only emotes you use (recommended).<br>
            • <strong>No Cache</strong>: Always loads from 7TV (no local storage).
        `;
        
        // Active Configuration Status
        const statusDiv = containerEl.createDiv();
        statusDiv.addClass('seven-tv-status');
        statusDiv.style.marginTop = '30px';
        statusDiv.style.padding = '15px';
        statusDiv.style.borderRadius = '8px';
        statusDiv.style.backgroundColor = 'var(--background-secondary-alt)';
        statusDiv.style.border = '1px solid var(--background-modifier-border)';
        
        const activeId = this.plugin.getActiveTwitchId();
        const activeStreamerKey = this.plugin.settings.selectedStreamerId;
        const activeStreamerName = activeStreamerKey ? 
            STREAMER_DISPLAY_MAP.get(activeStreamerKey) : null;
        
        statusDiv.innerHTML = `
            <h4 style="margin-top: 0;">Current Configuration</h4>
            <strong>Active Source:</strong> ${activeStreamerName ? `"${activeStreamerName}"` : activeId ? `Manual ID: ${activeId}` : 'None'}<br>
            <strong>Cache Strategy:</strong> ${this.plugin.settings.cacheStrategy}<br>
            <strong>Cache Location:</strong> ${this.plugin.settings.cacheStrategy !== 'no-cache' ? this.plugin.cacheDir : 'Disabled'}<br>
            <strong>Loaded Emotes:</strong> ${this.plugin.hasLoadedEmotes() ? 'Yes' : 'No'}<br>
            <br>
        `;
        
        console.log('[7TV] Settings tab displayed.');
    }
}

// =====================================================================
// SECTION 5: 7TV API INTEGRATION (UNCHANGED)
// =====================================================================

/**
 * Fetches a streamer's 7TV emotes using their Twitch numeric ID.
 * 
 * @param twitchId - The streamer's Twitch numeric ID (e.g., 71092938)
 * @returns A Map where keys are emote names and values are 7TV IDs
 */
async function fetchEmotesForTwitchId(twitchId: string): Promise<Map<string, string>> {
    const emoteMap = new Map<string, string>();
    // Always include HUH as a reliable fallback emote
    emoteMap.set('HUH', '01FFMS6Q4G0009CAK0J14692AY');
    
    try {
        const userRes = await fetch(`https://7tv.io/v3/users/twitch/${encodeURIComponent(twitchId)}`);
        if (!userRes.ok) throw new Error(`HTTP ${userRes.status}`);
        const userData = await userRes.json();
        
        const emoteSetId = userData?.emote_set?.id || 
                          (userData?.emote_sets && userData.emote_sets[0]?.id);
        if (!emoteSetId) throw new Error('No emote set found');
        
        const setRes = await fetch(`https://7tv.io/v3/emote-sets/${encodeURIComponent(emoteSetId)}`);
        if (!setRes.ok) throw new Error(`HTTP ${setRes.status}`);
        const setData = await setRes.json();
        
        if (setData?.emotes && Array.isArray(setData.emotes)) {
            setData.emotes.forEach((emote: any) => {
                if (emote.name && emote.id) {
                    emoteMap.set(emote.name, emote.id);
                }
            });
        }
    } catch (error) {
        console.error('[7TV] Failed to fetch 7TV emotes:', error);
    }
    
    return emoteMap;
}

// =====================================================================
// END OF PLUGIN CODE
// =====================================================================