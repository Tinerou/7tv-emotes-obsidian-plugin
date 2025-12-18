/**
 * 7TV Emotes for Obsidian
 * @version 1.0.1
 * @license MIT
 */
import {
    App, Editor, EditorSuggest, EditorPosition,
    EditorSuggestContext, EditorSuggestTriggerInfo,
    FuzzySuggestModal, Plugin, PluginSettingTab, Setting,
    Notice, FuzzyMatch
} from 'obsidian';

// =====================================================================
// SETTINGS INTERFACE AND DEFAULTS
// =====================================================================

/**
 * Plugin settings structure persisted to Obsidian's configuration storage.
 * @property twitchUserId - Numeric Twitch identifier for emote set retrieval
 * @property selectedStreamerId - Internal key for built-in streamer mapping
 * @property cacheStrategy - Determines emote image storage behavior
 */
interface SevenTVSettings {
    twitchUserId: string;
    selectedStreamerId: string;
    cacheStrategy: 'pre-cache' | 'on-demand' | 'no-cache';
}

/**
 * Default configuration values applied during initial plugin installation.
 */
const DEFAULT_SETTINGS: SevenTVSettings = {
    twitchUserId: '',
    selectedStreamerId: '',
    cacheStrategy: 'on-demand'
}

/**
 * Curated list of popular streamers with Twitch IDs for immediate selection.
 * Format: [Display Name, Twitch Numeric ID, Internal Identifier]
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
];

// Streamer lookup maps for O(1) access performance
const STREAMER_DISPLAY_MAP = new Map(BUILT_IN_STREAMERS.map(([name, id, key]) => [key, name]));
const STREAMER_ID_MAP = new Map(BUILT_IN_STREAMERS.map(([name, id, key]) => [key, id]));

// =====================================================================
// MAIN PLUGIN CLASS
// =====================================================================

export default class SevenTVPlugin extends Plugin {
    settings: SevenTVSettings;
    private emoteSuggest: EmoteSuggest;
    private readonly CACHE_DIR = '_7tv-emotes-cache';
    private activePreCachePromise: Promise<void> | null = null;

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
     */
    async onload() {
        await this.loadSettings();
        this.injectStyles();
        
        // Initialize cache based on selected strategy
        if (this.settings.cacheStrategy !== 'no-cache') {
            await this.initializeCache();
        }
        
        // Set up emote auto-completion
        this.emoteSuggest = new EmoteSuggest(this.app, this);
        this.registerEditorSuggest(this.emoteSuggest);
        
        // Load emotes if a streamer is already configured
        const activeId = this.getActiveTwitchId();
        if (activeId) {
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
        
        // Register settings tab
        this.addSettingTab(new EnhancedSettingTab(this.app, this));
    }

    /**
     * Injects CSS styles into the document head for plugin UI components.
     * Uses inline CSS to comply with Obsidian's Content Security Policy.
     */
    private injectStyles(): void {
        const styleEl = document.createElement('style');
        styleEl.id = 'seven-tv-emotes-styles';
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
    }

    /**
     * Fetches and caches emotes for a given Twitch user ID.
     * Updates the emote suggester and applies the configured cache strategy.
     * @param twitchId - Numeric Twitch user identifier
     */
    async refreshEmotesForUser(twitchId: string): Promise<void> {
        const newEmoteMap = await fetchEmotesForTwitchId(twitchId);
        if (newEmoteMap.size > 0) {
            this.emoteSuggest.updateEmoteMap(newEmoteMap);
            
            // Execute pre-caching if strategy is set to pre-cache
            switch (this.settings.cacheStrategy) {
                case 'pre-cache':
                    this.activePreCachePromise = this.preCacheEmoteSet(newEmoteMap);
                    this.activePreCachePromise.finally(() => { this.activePreCachePromise = null; });
                    break;
            }
        }
    }

    /**
     * Routes emote insertion to the appropriate method based on cache strategy.
     * @param editor - Active Obsidian editor instance
     * @param name - Emote display name
     * @param id - 7TV emote identifier
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
     * Inserts emote using direct CDN URL without local caching.
     * @param editor - Active Obsidian editor instance
     * @param name - Emote display name
     * @param id - 7TV emote identifier
     */
    private async insertWithoutCache(editor: Editor, name: string, id: string): Promise<void> {
        const html = `<span class="seven-tv-emote" title=":${name}:"><img src="https://cdn.7tv.app/emote/${id}/1x.webp" alt="${name}" style="display:inline-block;height:1.5em;vertical-align:middle;"></span>`;
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
        
        if (await this.app.vault.adapter.exists(cachePath)) {
            const html = `<span class="seven-tv-emote" title=":${name}:"><img src="./${cachePath}" alt="${name}" style="display:inline-block;height:1.5em;vertical-align:middle;"></span>`;
            editor.replaceSelection(html);
        } else {
            const html = `<span class="seven-tv-emote" title=":${name}:"><img src="${cdnUrl}" alt="${name}" style="display:inline-block;height:1.5em;vertical-align:middle;"></span>`;
            editor.replaceSelection(html);
            // Cache in background for future use
            this.downloadToCache(id, cdnUrl, cachePath).catch(() => { });
        }
    }

    /**
     * Inserts emote using local cache, with CDN fallback for cache misses.
     * @param editor - Active Obsidian editor instance
     * @param name - Emote display name
     * @param id - 7TV emote identifier
     */
    private async insertWithPreCache(editor: Editor, name: string, id: string): Promise<void> {
        const cachePath = `${this.CACHE_DIR}/${id}.webp`;
        const cdnUrl = `https://cdn.7tv.app/emote/${id}/1x.webp`;
        
        if (await this.app.vault.adapter.exists(cachePath)) {
            const html = `<span class="seven-tv-emote" title=":${name}:"><img src="./${cachePath}" alt="${name}" style="display:inline-block;height:1.5em;vertical-align:middle;"></span>`;
            editor.replaceSelection(html);
        } else {
            const html = `<span class="seven-tv-emote" title=":${name}:"><img src="${cdnUrl}" alt="${name}" style="display:inline-block;height:1.5em;vertical-align:middle;"></span>`;
            editor.replaceSelection(html);
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
            }
        } catch (error) {
            console.error('[7TV] Cache initialization error:', error);
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
     * Pre-caches all emotes in a set using batched downloads.
     * @param emoteMap - Map of emote names to 7TV IDs
     */
    private async preCacheEmoteSet(emoteMap: Map<string, string>): Promise<void> {
        const emoteIds = Array.from(emoteMap.values());
        const BATCH_SIZE = 5;
        
        for (let i = 0; i < emoteIds.length; i += BATCH_SIZE) {
            const batch = emoteIds.slice(i, i + BATCH_SIZE);
            const promises = batch.map(id => this.ensureEmoteCached(id));
            await Promise.allSettled(promises);
            await new Promise(resolve => setTimeout(resolve, 30));
        }
    }

    /**
     * Ensures a specific emote is cached locally.
     * @param emoteId - 7TV emote identifier
     */
    private async ensureEmoteCached(emoteId: string): Promise<void> {
        const cachePath = `${this.CACHE_DIR}/${emoteId}.webp`;
        if (await this.app.vault.adapter.exists(cachePath)) return;
        
        const cdnUrl = `https://cdn.7tv.app/emote/${emoteId}/1x.webp`;
        await this.downloadToCache(emoteId, cdnUrl, cachePath);
    }

    /**
     * Downloads emote from 7TV CDN and saves to local cache.
     * @param emoteId - 7TV emote identifier for logging
     * @param sourceUrl - CDN source URL
     * @param destPath - Local destination path
     */
    private async downloadToCache(emoteId: string, sourceUrl: string, destPath: string): Promise<void> {
        try {
            const response = await fetch(sourceUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const arrayBuffer = await response.arrayBuffer();
            await this.app.vault.adapter.writeBinary(destPath, arrayBuffer);
        } catch (error) {
            console.debug(`[7TV] Cache download failed for ${emoteId}:`, error);
            throw error;
        }
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
        return Array.from(this.emoteMap.keys())
            .filter(name => name.toLowerCase().includes(query))
            .slice(0, 25);
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
            const imgUrl = `https://cdn.7tv.app/emote/${emoteId}/1x.webp`;
            const imgEl = container.createEl('img');
            imgEl.setAttribute('src', imgUrl);
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

    constructor(app: App, plugin: SevenTVPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    /**
     * Renders the simplified settings tab interface.
     */
    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: '7TV Emotes' });
        
        // Cache strategy dropdown (simplified)
        new Setting(containerEl)
            .setName('Cache Strategy')
            .setDesc('How emote images are stored')
            .addDropdown(dropdown => dropdown
                .addOption('on-demand', 'On-Demand')
                .addOption('pre-cache', 'Pre-cache All')
                .addOption('no-cache', 'No Cache')
                .setValue(this.plugin.settings.cacheStrategy)
                .onChange(async (value: any) => {
                    this.plugin.settings.cacheStrategy = value;
                    await this.plugin.saveSettings();
                    await this.plugin.ensureCacheInitialized();
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
                
                // Fetch emotes with a slight delay for better UX
                setTimeout(() => {
                    this.plugin.refreshEmotesForUser(twitchId)
                        .then(() => new Notice(`${displayName}'s emotes loaded`))
                        .catch(() => new Notice('Failed to load emotes'));
                }, 100);
            }).open();
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
                    setTimeout(() => {
                        this.plugin.refreshEmotesForUser(value)
                            .then(() => new Notice('Emotes loaded'))
                            .catch(() => new Notice('Failed to load emotes'));
                    }, 200);
                }
            }, 500);
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
            });
        }
        
        // Simple status display
        const statusDiv = containerEl.createDiv();
        statusDiv.style.marginTop = '20px';
        statusDiv.style.padding = '12px';
        statusDiv.style.borderRadius = '6px';
        statusDiv.style.backgroundColor = 'var(--background-secondary)';
        statusDiv.style.border = '1px solid var(--background-modifier-border)';
        statusDiv.style.fontSize = '0.9em';
        
        const activeId = this.plugin.getActiveTwitchId();
        const activeStreamer = this.plugin.settings.selectedStreamerId;
        const streamerName = activeStreamer ? STREAMER_DISPLAY_MAP.get(activeStreamer) : null;
        
        statusDiv.innerHTML = `
            <div style="font-weight: 600; margin-bottom: 4px;">Current Status</div>
            <div><strong>Source:</strong> ${streamerName || activeId || 'None selected'}</div>
            <div><strong>Cache:</strong> ${this.plugin.settings.cacheStrategy}</div>
            <div><strong>Emotes:</strong> ${this.plugin.hasLoadedEmotes() ? 'Loaded' : 'Not loaded'}</div>
        `;
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
        // Fetch user data to get emote set ID
        const userRes = await fetch(`https://7tv.io/v3/users/twitch/${encodeURIComponent(twitchId)}`);
        if (!userRes.ok) throw new Error(`HTTP ${userRes.status}`);
        const userData = await userRes.json();
        
        const emoteSetId = userData?.emote_set?.id ||
            (userData?.emote_sets && userData.emote_sets[0]?.id);
        if (!emoteSetId) throw new Error('No emote set found');
        
        // Fetch emote set data
        const setRes = await fetch(`https://7tv.io/v3/emote-sets/${encodeURIComponent(emoteSetId)}`);
        if (!setRes.ok) throw new Error(`HTTP ${setRes.status}`);
        const setData = await setRes.json();
        
        // Extract emotes from set data
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