# 7TV Emotes for Obsidian

Integrate 7TV emotes directly into your Obsidian notes with auto-complete suggestions, streamer-specific emote sets, and local caching for offline reliability.

## ✨ Features

- **Auto-complete suggestions**: Type `:` followed by an emote name to see suggestions with preview images
- **Streamer emote sets**: Use any streamer's 7TV emote collection by entering their Twitch ID
- **Local caching**: Emotes are saved locally for offline access and long-term reliability
- **Inline display**: Emotes display properly inline with text, with hover tooltips showing the emote code
- **Zero external dependencies**: Works for anyone viewing notes, even without the plugin installed

## 📦 Installation

### Manual Installation
1. Download the latest release from the [Releases](https://github.com/yourusername/7tv-emotes-obsidian/releases) page
2. Extract the files to your vault's `.obsidian/plugins/7tv-emotes/` folder
3. Enable the plugin in Obsidian: Settings → Community plugins → 7TV Emotes

### From Obsidian Community Plugins
*(Coming soon - submit your plugin to the community plugins list)*

## ⚙️ Setup

### 1. Configure a Streamer's Emote Set
1. Open Obsidian Settings
2. Navigate to "7TV Emotes" in the plugin settings
3. Enter the **numeric Twitch ID** of the streamer whose emotes you want to use
   - **Not their username** - you need the numeric ID
   - Find it on sites like [TwitchID Finder](https://www.twitchidfinder.com/)
4. Save the settings - the plugin will automatically fetch that streamer's 7TV emote set

### 2. Understanding the Cache
The plugin automatically creates a `_7tv-emotes-cache/` folder in your vault. This:
- Stores emote images locally for offline use
- Ensures notes remain functional even if 7TV CDN links change
- Makes shared vaults viewable without requiring the plugin

## 🚀 Usage

### Basic Emote Insertion
1. In any note, type `:` followed by an emote name
   - Example: `:HU` (will suggest `:HUH:`)
2. A suggestion popup will appear showing emote images and codes
3. Press `Enter` or `Tab` to select an emote, or click with your mouse
4. The typed text (`:HUH:`) will be replaced with the emote image

### Complete Emote Codes
You can also type the full emote code:
- Type `:HUH:` (including both colons)
- The suggestion popup will appear immediately after the second `:`
- Select the suggestion to insert the emote

### Manual Emote Insertion (Fallback)
If auto-complete doesn't trigger, use the command palette:
- Press `Ctrl+P` (or `Cmd+P` on Mac)
- Search for "Insert HUH emote (Manual Fallback)"
- This inserts the HUH emote as a reliable fallback

### Hover Information
- Hover your cursor over any inserted emote to see its code (e.g., `:HUH:`)
- This helps identify emotes and remember their codes

## 🎯 Examples

### Inline with Text
```markdown
I can't wait to use emotes on Obsidian! :pog:
```
Note: At this point in time you must have to click emote preview or press `ENTER` to insert emote.
