/**
 * 7TV Emotes for Obsidian
 * 
 * A plugin that integrates 7TV emotes into Obsidian notes with auto-complete
 * functionality and streamer-specific emote set support.
 * 
 * @version 1.0.0
 * @license MIT
 */

import { 
    App, 
    Editor, 
    EditorSuggest, 
    EditorPosition, 
    EditorSuggestContext, 
    EditorSuggestTriggerInfo, 
    Plugin, 
    PluginSettingTab, 
    Setting 
} from 'obsidian';

// =====================================================================
// SECTION 1: PLUGIN SETTINGS INTERFACE AND DEFAULTS
// =====================================================================

/**
 * Defines the structure for the plugin's persistent settings.
 * 
 * @property twitchUserId - The numeric Twitch ID used to fetch a streamer's
 * 7TV emote set. This is NOT the username.
 */
interface SevenTVSettings {
    twitchUserId: string;
}

/**
 * Default settings values for new plugin installations.
 */
const DEFAULT_SETTINGS: SevenTVSettings = {
    twitchUserId: ''
}

// =====================================================================
// SECTION 2: MAIN PLUGIN CLASS
// =====================================================================

/**
 * The main plugin class that Obsidian instantiates and manages.
 * Handles initialization, settings, and core plugin lifecycle.
 */
export default class SevenTVPlugin extends Plugin {
    /** Plugin settings loaded from disk */
    settings: SevenTVSettings;
    
    /** Reference to the auto-complete suggestion engine */
    private emoteSuggest: EmoteSuggest;

    // ======================
    // LIFECYCLE METHODS
    // ======================

    /**
     * Called when the plugin is enabled. Initializes all plugin functionality.
     */
    async onload() {
        await this.loadSettings();
        console.log('[7TV] Plugin loading...');

        // Initialize the auto-complete engine
        this.emoteSuggest = new EmoteSuggest(this.app);
        this.registerEditorSuggest(this.emoteSuggest);

        // Fetch emotes on startup if a Twitch ID is already configured
        if (this.settings.twitchUserId) {
            await this.refreshEmotesForCurrentUser();
        }

        // Register the manual emote insertion command (fallback)
        this.addCommand({
            id: 'insert-huh-emote-manual',
            name: 'Insert HUH emote (Manual Fallback)',
            editorCallback: (editor: Editor) => {
                const html = `<img src="https://cdn.7tv.app/emote/01FFMS6Q4G0009CAK0J14692AY/1x.webp" alt="HUH" style="display: inline-block; height: 1.5em; vertical-align: middle;">`;
                editor.replaceSelection(html);
            }
        });

        // Add the settings tab for user configuration
        this.addSettingTab(new SevenTVSettingTab(this.app, this));

        console.log('[7TV] Plugin loaded successfully.');
    }

    /**
     * Called when the plugin is disabled. Perform any necessary cleanup.
     */
    onunload() {
        console.log('[7TV] Plugin unloaded.');
    }

    // ======================
    // PLUGIN FUNCTIONALITY
    // ======================

    /**
     * Fetches the emote set for the currently configured Twitch user
     * and updates the auto-complete engine.
     * 
     * @returns Promise that resolves when the emote refresh is complete
     */
    async refreshEmotesForCurrentUser(): Promise<void> {
        if (!this.settings.twitchUserId) {
            console.log('[7TV] No Twitch User ID configured. Skipping emote fetch.');
            return;
        }

        console.log(`[7TV] Fetching emotes for Twitch ID: ${this.settings.twitchUserId}`);
        const newEmoteMap = await fetchEmotesForTwitchId(this.settings.twitchUserId);

        if (newEmoteMap.size > 0) {
            this.emoteSuggest.updateEmoteMap(newEmoteMap);
            console.log(`[7TV] Successfully loaded ${newEmoteMap.size} emotes.`);
        } else {
            console.log('[7TV] No emotes were loaded. Keeping previous list.');
        }
    }

    // ======================
    // SETTINGS MANAGEMENT
    // ======================

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
// SECTION 3: 7TV API INTEGRATION
// =====================================================================

/**
 * Fetches a streamer's 7TV emotes using their Twitch numeric ID.
 * 
 * This function makes two API calls:
 * 1. Gets the user's emote set ID from 7TV
 * 2. Fetches the full list of emotes from that set
 * 
 * @param twitchId - The streamer's Twitch numeric ID (e.g., 71092938)
 * @returns A Map where keys are emote names and values are 7TV IDs
 * 
 * @throws Will log errors to console but not throw to prevent plugin crashes
 */
async function fetchEmotesForTwitchId(twitchId: string): Promise<Map<string, string>> {
    const emoteMap = new Map<string, string>();

    // Always include HUH as a reliable fallback emote
    emoteMap.set('HUH', '01FFMS6Q4G0009CAK0J14692AY');
    
    // 7TV API endpoint constants
    const USER_API_URL = `https://7tv.io/v3/users/twitch/${encodeURIComponent(twitchId)}`;
    const EMOTE_SET_API_URL_PREFIX = 'https://7tv.io/v3/emote-sets/';

    try {
        // STEP 1: Get the user's emote set ID
        console.log(`[7TV] Fetching user data from: ${USER_API_URL}`);
        const userRes = await fetch(USER_API_URL);
        
        if (!userRes.ok) {
            const errorMsg = `7TV user fetch failed with status: ${userRes.status}`;
            console.error(`[7TV] ${errorMsg}`);
            throw new Error(errorMsg);
        }

        const userData = await userRes.json();
        
        // Extract emote set ID (API structure may vary between users)
        const emoteSetId = userData?.emote_set?.id || 
                          (userData?.emote_sets && userData.emote_sets[0]?.id);
        
        if (!emoteSetId) {
            throw new Error('User found, but no emote set ID was available.');
        }

        // STEP 2: Get the list of emotes from the set
        const emoteSetUrl = `${EMOTE_SET_API_URL_PREFIX}${encodeURIComponent(emoteSetId)}`;
        console.log(`[7TV] Fetching emote set from: ${emoteSetUrl}`);
        
        const setRes = await fetch(emoteSetUrl);
        
        if (!setRes.ok) {
            const errorMsg = `7TV emote set fetch failed with status: ${setRes.status}`;
            console.error(`[7TV] ${errorMsg}`);
            throw new Error(errorMsg);
        }

        const setData = await setRes.json();

        // STEP 3: Populate the map with valid emotes
        if (setData?.emotes && Array.isArray(setData.emotes)) {
            let validEmoteCount = 0;
            
            setData.emotes.forEach((emote: any) => {
                if (emote.name && emote.id) {
                    emoteMap.set(emote.name, emote.id);
                    validEmoteCount++;
                }
            });
            
            console.log(`[7TV] Found ${validEmoteCount} valid emotes in the set.`);
        } else {
            console.warn('[7TV] No emotes array found in the response.');
        }

    } catch (error) {
        console.error('[7TV] Failed to fetch 7TV emotes:', error);
        // Error is caught and logged - the map still contains the HUH fallback
    }

    console.log(`[7TV] Returning emote map with ${emoteMap.size} total emotes.`);
    return emoteMap;
}

// =====================================================================
// SECTION 4: AUTO-COMPLETE ENGINE (EditorSuggest)
// =====================================================================

/**
 * The auto-complete engine that provides emote suggestions as users type.
 * 
 * Key features:
 * - Triggers on colon (:) character
 * - Shows emote images and names in suggestions
 * - Enhanced to trigger on second colon (e.g., :HUH:)
 * - Handles emote insertion with proper HTML formatting
 */
class EmoteSuggest extends EditorSuggest<string> {
    /** Map of emote names to their 7TV IDs */
    private emoteMap: Map<string, string> = new Map([['HUH', '01FFMS6Q4G0009CAK0J14692AY']]);

    /**
     * Creates a new EmoteSuggest instance.
     * 
     * @param app - The Obsidian App instance
     */
    constructor(app: App) {
        super(app);
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
    // EDITORSUGGEST IMPLEMENTATION
    // ======================

    /**
     * Determines when to trigger the suggestion popup.
     * 
     * Enhanced to detect both:
     * - Partial typing (e.g., ":HU") 
     * - Complete emote codes with trailing colon (e.g., ":HUH:")
     * 
     * The regex `/:(?:\w+:?)$/` breaks down as:
     * - `:` - literal colon
     * - `(?:\w+:?)` - non-capturing group for word characters, with optional trailing colon
     * - `$` - end of string (cursor position)
     * 
     * @param cursor - Current cursor position in the editor
     * @param editor - The active editor instance
     * @returns Trigger information or null if no trigger detected
     */
    onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {
        const line = editor.getLine(cursor.line);
        const sub = line.substring(0, cursor.ch);
        
        // Match patterns like ":HU" or ":HUH:"
        const match = sub.match(/:(?:\w+:?)$/);
        
        if (match) {
            // Extract just the word part (without colons) for the query
            const fullMatch = match[0]; // e.g., ":HU" or ":HUH:"
            const query = fullMatch.slice(1).replace(/:$/, ''); // Remove both colons
            
            // Calculate start position (location of the first colon)
            const startPos = cursor.ch - fullMatch.length;
            
            // Determine end position based on whether a trailing colon exists
            const hasTrailingColon = fullMatch.endsWith(':');
            const endPos = hasTrailingColon ? cursor : cursor;
            
            console.log(`[7TV] Trigger detected: query="${query}", hasTrailingColon=${hasTrailingColon}`);
            
            return {
                start: { line: cursor.line, ch: Math.max(0, startPos) },
                end: endPos,
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
        const container = el.createDiv({ cls: 'seven-tv-suggestion-item' });
        
        // Get the emote ID and create image if available
        const emoteId = this.emoteMap.get(value);
        if (emoteId) {
            const imgUrl = `https://cdn.7tv.app/emote/${emoteId}/1x.webp`;
            const imgEl = container.createEl('img', {
                attr: {
                    src: imgUrl,
                    alt: value,
                    class: 'seven-tv-suggestion-img',
                    'data-emote-name': value
                }
            });
            
            // Style the image for consistent display
            imgEl.setAttribute('style', 
                'height: 1.5em; ' +
                'vertical-align: middle; ' +
                'margin-right: 0.5em; ' +
                'border-radius: 3px;'
            );
        }
        
        // Add the emote code as text
        const textSpan = container.createEl('span', { 
            text: `:${value}:`,
            cls: 'seven-tv-suggestion-text'
        });
        textSpan.setAttribute('style', 
            'vertical-align: middle; ' +
            'color: var(--text-muted); ' +
            'font-family: var(--font-monospace); ' +
            'font-size: 0.9em;'
        );
        
        console.log(`[7TV] Rendered suggestion for: :${value}:`);
    }

    /**
     * Handles the selection of a suggestion from the popup.
     * 
     * Replaces the typed text with the full emote HTML, including
     * hover tooltip functionality.
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

        // Calculate the range to delete
        // We need to check if the user typed a trailing colon
        const typedRange = editor.getRange(this.context.start, this.context.end);
        const hasTrailingColon = typedRange.endsWith(':');
        
        // Adjust end position if we need to delete a trailing colon
        let deleteEnd = this.context.end;
        if (hasTrailingColon && this.context.end.ch > this.context.start.ch) {
            deleteEnd = { ...this.context.end };
        }

        // Delete the typed text (e.g., ":HU" or ":HUH:")
        editor.replaceRange('', this.context.start, deleteEnd);
        
        // Insert the formatted emote with hover tooltip
        const html = `<span class="seven-tv-emote" title=":${value}:"><img src="https://cdn.7tv.app/emote/${emoteId}/1x.webp" alt="${value}" style="display: inline-block; height: 1.5em; vertical-align: middle;"> </span>`;
        
        editor.replaceSelection(html);
        
        console.log(`[7TV] Inserted emote: :${value}: (ID: ${emoteId})`);
    }
}

// =====================================================================
// SECTION 5: SETTINGS TAB
// =====================================================================

/**
 * The settings tab for configuring the 7TV plugin.
 * Provides a user interface for entering and managing Twitch User IDs.
 */
class SevenTVSettingTab extends PluginSettingTab {
    /** Reference to the main plugin instance */
    plugin: SevenTVPlugin;

    /**
     * Creates a new settings tab.
     * 
     * @param app - The Obsidian App instance
     * @param plugin - The main plugin instance
     */
    constructor(app: App, plugin: SevenTVPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    /**
     * Renders the settings tab interface.
     */
    display(): void {
        const { containerEl } = this;
        
        // Clear any existing content
        containerEl.empty();
        
        // Add title
        containerEl.createEl('h2', { text: '7TV Emotes Settings' });
        
        // ======================
        // TWITCH USER ID SETTING
        // ======================
        
        const twitchSetting = new Setting(containerEl)
            .setName('Twitch User ID')
            .setDesc('Enter the numeric Twitch ID of the streamer whose emotes you want to use.')
            .addText(text => text
                .setPlaceholder('e.g., 71092938')
                .setValue(this.plugin.settings.twitchUserId)
                .onChange(async (value) => {
                    const trimmedValue = value.trim();
                    
                    // Validate input (basic numeric check)
                    if (trimmedValue && !/^\d+$/.test(trimmedValue)) {
                        console.warn(`[7TV] Invalid Twitch ID entered: ${trimmedValue}`);
                        // You could add user feedback here
                    }
                    
                    this.plugin.settings.twitchUserId = trimmedValue;
                    await this.plugin.saveSettings();
                    
                    console.log(`[7TV] Twitch User ID updated to: ${trimmedValue}`);
                    
                    // Fetch new emotes automatically when the ID changes
                    if (trimmedValue) {
                        await this.plugin.refreshEmotesForCurrentUser();
                    }
                }));
        
        // Add additional help text to the setting
        twitchSetting.descEl.createEl('br');
        twitchSetting.descEl.createEl('small', {
            text: 'Find this ID on sites like twitchidfinder.com (use the numeric ID, not username).',
            cls: 'setting-item-description'
        });
        
        // ======================
        // INFORMATION SECTION
        // ======================
        
        const infoDiv = containerEl.createDiv('seven-tv-info');
        infoDiv.setAttribute('style', 
            'margin-top: 30px; ' +
            'padding: 15px; ' +
            'border-radius: 5px; ' +
            'background-color: var(--background-secondary); ' +
            'border-left: 4px solid var(--interactive-accent);'
        );
        
        const header = infoDiv.createEl('h3', { text: 'How to Use' });
		header.style.marginTop = '0';
        
        const instructions = [
            '1. Find a streamer\'s numeric Twitch ID (not username).',
            '2. Enter it above and save. The plugin will fetch their 7TV emote set.',
            '3. Type <code>:EMOTE_NAME:</code> in any note for auto-complete suggestions.',
            '4. Select an emote from the dropdown to insert it.',
            '5. Hover over inserted emotes to see their code.'
        ];
        
        instructions.forEach(instruction => {
            const p = infoDiv.createEl('p', {
                text: instruction,
                cls: 'setting-item-description'
            });
            p.setAttribute('style', 'margin-bottom: 8px;');
        });
        
        // ======================
        // STATUS INFORMATION
        // ======================
        
        const statusDiv = containerEl.createDiv('seven-tv-status');
        statusDiv.setAttribute('style', 
            'margin-top: 20px; ' +
            'font-size: 0.9em; ' +
            'color: var(--text-muted);'
        );
        
        const lastUpdated = new Date().toLocaleDateString();
        statusDiv.innerHTML = `
            <strong>Plugin Status:</strong> Active<br>
            <strong>HUH Fallback:</strong> Always available<br>
            <strong>Last Code Update:</strong> ${lastUpdated}<br>
            <br>
            <em>Need help? Check the Obsidian plugin developer documentation.</em>
        `;
        
        console.log('[7TV] Settings tab displayed.');
    }
}

// =====================================================================
// END OF PLUGIN CODE
// =====================================================================