# 7TV Emotes for Obsidian

Integrate 7TV emotes directly into your Obsidian notes with auto-complete suggestions, streamer-specific emote sets, and local caching for offline reliability.

## ✨ Features

- **Auto-complete suggestions**: Type `:` followed by an emote name to see suggestions with preview images. Must press `ENTER` or click on desired emote.
- **Streamer emote sets**: Pulled from their emote sets on https://7tv.app/.
- **Local caching**: Emotes are saved locally for offline viewing and long-term reliability (must still have internet connection to place emotes reliably).
- **Inline display**: Emotes display properly inline with text.

## 📦 Installation

### Manual Installation
1. Download the latest release from https://github.com/Tinerou/7tv-emotes-obsidian-plugin
2. Extract the files to your vault's `.obsidian/plugins/7tv-emotes/` folder
3. Enable the plugin in Obsidian: Settings → Community plugins → 7TV Emotes

### From Obsidian Community Plugins
*(Coming soon)*

## ⚙️ Setup

### 1. Configure a Streamer's Emote Set
1. Open Obsidian Settings
2. Navigate to "7TV Emotes" in the plugin settings
3. Simply search for a streamer in the drop down menu or manually enter the **numeric Twitch ID** of the streamer whose emotes you want to use
	- **Not their username** - you need the numeric ID
	- You can often find these online using a converter.
4. All set. Have fun using the emotes!


### 2. Understanding the Cache
The plugin automatically creates a `_7tv-emotes-cache/` folder in your vault. This:
- Stores emote images locally for offline use
- Ensures notes remain functional even if 7TV CDN links change
- Makes shared vaults viewable without requiring the plugin

## 🚀 Usage

### Emote Insertion
1. In any note, type `:` followed by an emote name
   - Example: `:HU` (will suggest `:HUH:`)
2. A suggestion popup will appear showing emote images and codes
3. Press `Enter` or `Tab` to select an emote, or click with your mouse
4. The typed text (`:HUH:`) will be replaced with the emote image

## 🎯 Examples

### Inline with Text
```markdown
I can't wait to use emotes on Obsidian! :pog:
```
Note: At this point in time you must have to click emote preview or press `ENTER` to insert emote.

