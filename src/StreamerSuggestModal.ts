import { App, FuzzyMatch, FuzzySuggestModal } from 'obsidian';
import type SevenTVPlugin from '../index';

export class StreamerSuggestModal extends FuzzySuggestModal<string> {
	constructor(
		app: App,
		private readonly plugin: SevenTVPlugin,
		private readonly onChoose: (streamerKey: string) => void
	) {
		super(app);
		this.setPlaceholder('Search for streamers...');
		this.limit = 999;
	}

	getItems(): string[] {
		return Array.from(this.plugin.getStreamerDisplayMap().entries())
			.sort((a, b) => a[1].localeCompare(b[1]))
			.map(([key]) => key);
	}

	getItemText(item: string): string {
		return this.plugin.getStreamerDisplayMap().get(item) ?? item;
	}

	onChooseItem(item: string): void {
		this.onChoose(item);
	}

	renderSuggestion(fuzzyMatch: FuzzyMatch<string>, el: HTMLElement): void {
		const item = fuzzyMatch.item;
		const displayName = this.plugin.getStreamerDisplayMap().get(item) ?? item;
		const twitchId = this.plugin.getStreamerIdMap().get(item) ?? 'Unknown ID';

		const container = el.createDiv({ cls: 'seven-tv-streamer-suggestion-container' });
		const info = container.createDiv({ cls: 'seven-tv-streamer-info-section' });

		info.createDiv({
			cls: 'seven-tv-streamer-suggestion-name',
			text: displayName
		});
		info.createDiv({
			cls: 'seven-tv-streamer-suggestion-id',
			text: `Twitch ID: ${twitchId}`
		});

		if (this.plugin.settings.selectedStreamerId === item) {
			container.createDiv({
				cls: 'seven-tv-streamer-selected-indicator',
				text: '✓ Selected'
			});
		}
	}
}
