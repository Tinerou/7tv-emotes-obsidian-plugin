# 7TV Emotes for Obsidian

Use [7TV](https://7tv.app/) emotes directly inside your Obsidian notes. Type `:` and a few letters, pick an emote from the popup, and it shows up inline with your text — just like on Twitch or Discord.

> **New to 7TV?** 7TV is a popular emote extension used in Twitch chats. It lets streamers and viewers share custom animated and static emotes (like `:HUH:`, `:pog:`, `:KEKW:`). This plugin brings those same emotes into your notes.

<picture class="seven-tv-emote"><source srcset="app://9f3827291073f9eebb190441d254a732a5a9/Users/treybrown/Documents/7tv-test-vault/_7tv-emotes-cache/01GEMGQ08R0005045RDHFPSRYY.webp?1778092446939" type="image/webp"><source srcset="https://cdn.7tv.app/emote/01GEMGQ08R0005045RDHFPSRYY/1x.webp" type="image/webp"><img class="seven-tv-inline-emote" loading="lazy" decoding="async" src="https://cdn.7tv.app/emote/01GEMGQ08R0005045RDHFPSRYY/1x.webp" alt=":EDM:" title=":EDM:"></picture><picture class="seven-tv-emote"><source srcset="app://9f3827291073f9eebb190441d254a732a5a9/Users/treybrown/Documents/7tv-test-vault/_7tv-emotes-cache/01G1GXCR380004YN3NKDRR9QHD.webp?1778092456342" type="image/webp"><source srcset="https://cdn.7tv.app/emote/01G1GXCR380004YN3NKDRR9QHD/1x.webp" type="image/webp"><img class="seven-tv-inline-emote" loading="lazy" decoding="async" src="https://cdn.7tv.app/emote/01G1GXCR380004YN3NKDRR9QHD/1x.webp" alt=":wideVIBE:" title=":wideVIBE:"></picture><picture class="seven-tv-emote"><source srcset="app://9f3827291073f9eebb190441d254a732a5a9/Users/treybrown/Documents/7tv-test-vault/_7tv-emotes-cache/01GEMGQ08R0005045RDHFPSRYY.webp?1778092446939" type="image/webp"><source srcset="https://cdn.7tv.app/emote/01GEMGQ08R0005045RDHFPSRYY/1x.webp" type="image/webp"><img class="seven-tv-inline-emote" loading="lazy" decoding="async" src="https://cdn.7tv.app/emote/01GEMGQ08R0005045RDHFPSRYY/1x.webp" alt=":EDM:" title=":EDM:"></picture>
## ✨ Features

- **Type-to-suggest** — Start typing `:` followed by an emote name and a preview popup appears. Hit `Enter` or click to insert. <picture class="seven-tv-emote"><source srcset="https://cdn.7tv.app/emote/01FBZESCNR000A6AWCB1X558GZ/1x.webp" type="image/webp"><source srcset="app://9f3827291073f9eebb190441d254a732a5a9/Users/treybrown/Documents/7tv-test-vault/_7tv-emotes-cache/01FBZESCNR000A6AWCB1X558GZ.webp?1778709241230" type="image/webp"><img class="seven-tv-inline-emote" loading="lazy" decoding="async" src="https://cdn.7tv.app/emote/01FBZESCNR000A6AWCB1X558GZ/1x.webp" alt=":Chatting:" title=":Chatting:"></picture>
- **Per-streamer emote sets** — Pull in the emote set of any streamer registered on [7tv.app](https://7tv.app/).
- **Local caching** — Emotes are saved to your vault so they keep working offline and won't break if a CDN link changes.
- **Inline rendering** — Emotes display cleanly inline with your text, not as separate blocks.

## 📦 Installation

### Manual Installation
1. Download the latest release from the [GitHub releases page](https://github.com/Tinerou/7tv-emotes-obsidian-plugin).
2. Extract the files into your vault's `.obsidian/plugins/7tv-emotes/` folder.
3. In Obsidian, go to **Settings → Community plugins → 7TV Emotes** and toggle it on.

### From Obsidian Community Plugins
*Coming soon.*

## ⚙️ Setup

### 1. Pick a streamer
1. Open **Settings → 7TV Emotes**.
2. Search for a streamer in the dropdown, **or** paste in their **numeric Twitch ID** manually.
   - This is the numeric user ID, **not** their Twitch username.
   - You can look it up with any "Twitch username to ID" converter online.
1. That's it — start typing `:` in any note to use their emotes.

### 2. About the cache folder
The plugin creates a `_7tv-emotes-cache/` folder in your vault automatically. This folder:
- Stores emote images locally so they work offline.
- Keeps your notes intact even if a 7TV CDN link changes down the road.
- Lets others view your vault with the emotes already rendered, even without the plugin installed.

You can safely commit this folder to a synced/shared vault.

## 🚀 Usage

1. In any note, type `:` followed by the start of an emote name (e.g. `:HU`).
2. A popup appears showing matching emotes with previews.
3. Press `Enter` (or click) to insert the one you want.
4. The text gets replaced with the emote image inline.

### Example

```markdown
I can't wait to use emotes in Obsidian! :batJam:
```

I can't wait to use emotes in Obsidian! <picture class="seven-tv-emote"><source srcset="app://9f3827291073f9eebb190441d254a732a5a9/Users/treybrown/Documents/7tv-test-vault/_7tv-emotes-cache/01FGYFTSB0000DR9KT6H0R2B7W.webp?1778709084292" type="image/webp"><source srcset="https://cdn.7tv.app/emote/01FGYFTSB0000DR9KT6H0R2B7W/1x.webp" type="image/webp"><img class="seven-tv-inline-emote" loading="lazy" decoding="async" src="https://cdn.7tv.app/emote/01FGYFTSB0000DR9KT6H0R2B7W/1x.webp" alt=":batJAM:" title=":batJAM:"></picture>
## ❓ FAQ / Troubleshooting

**The popup isn't appearing when I type `:`**
Make sure the plugin is enabled in Community plugins and that you've configured a streamer's Twitch ID in the settings.

**Emotes aren't loading / show as broken images**
You'll need an internet connection the first time an emote is inserted so it can be downloaded into the cache. Once cached, it works offline.

**I entered a username instead of a numeric ID and nothing works**
The settings field expects a **numeric** Twitch user ID, not a username. Use any online "Twitch username to user ID" tool to convert it.

**Can I use multiple streamers' emote sets at once?**
Currently the plugin loads one streamer's set at a time. Multi-set support may come in a future release.

**Any other issues?**
Let me know so I can fix them. <picture class="seven-tv-emote"><source srcset="app://9f3827291073f9eebb190441d254a732a5a9/Users/treybrown/Documents/7tv-test-vault/_7tv-emotes-cache/01HMBMJPV0000D32KQCYBK4S1D.webp?1778709199149" type="image/webp"><source srcset="https://cdn.7tv.app/emote/01HMBMJPV0000D32KQCYBK4S1D/1x.webp" type="image/webp"><img class="seven-tv-inline-emote" loading="lazy" decoding="async" src="https://cdn.7tv.app/emote/01HMBMJPV0000D32KQCYBK4S1D/1x.webp" alt=":aga:" title=":aga:"></picture>

## 🤝 Contributing

Bug reports, feature requests, and PRs are welcome — open an issue on the [GitHub repo](https://github.com/Tinerou/7tv-emotes-obsidian-plugin).

## 📄 License

Released under the MIT License. See `LICENSE` for details.
