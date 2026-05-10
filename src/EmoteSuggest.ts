import {
	App,
	Editor,
	EditorPosition,
	EditorSuggest,
	EditorSuggestContext,
	EditorSuggestTriggerInfo
} from 'obsidian';
import type SevenTVPlugin from '../index';

export class EmoteSuggest extends EditorSuggest<string> {
	private emoteMap: Map<string, string> = new Map();

	constructor(app: App, private readonly plugin: SevenTVPlugin) {
		super(app);
	}

	updateEmoteMap(newMap: Map<string, string>): void {
		this.emoteMap = new Map(newMap);
		this.plugin.logMessage(`Emote map updated with ${newMap.size} emotes`, 'verbose');
	}

	getEmoteMap(): Map<string, string> {
		return this.emoteMap;
	}

	getEmoteCount(): number {
		return this.emoteMap.size;
	}

	onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {
		const line = editor.getLine(cursor.line);
		const sub = line.substring(0, cursor.ch);
		const match = sub.match(/:([a-zA-Z0-9_]+):?$/);
		if (!match) {
			return null;
		}

		const fullMatch = match[0];
		const query = match[1];
		const startPos = cursor.ch - fullMatch.length;

		return {
			start: { line: cursor.line, ch: Math.max(0, startPos) },
			end: cursor,
			query
		};
	}

	getSuggestions(context: EditorSuggestContext): string[] {
		const query = context.query.toLowerCase();
		return Array.from(this.emoteMap.keys())
			.filter((name) => name.toLowerCase().includes(query))
			.slice(0, 25);
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.empty();
		const container = el.createDiv({ cls: 'seven-tv-suggestion-item' });
		const emoteId = this.emoteMap.get(value);

		if (emoteId) {
			const image = container.createEl('img');
			image.addClass('seven-tv-suggestion-img');
			image.setAttribute('src', `https://cdn.7tv.app/emote/${emoteId}/1x.webp`);
			image.setAttribute('alt', value);
			image.setAttribute('data-emote-name', value);
		}

		container.createSpan({
			cls: 'seven-tv-suggestion-text',
			text: `:${value}:`
		});
	}

	selectSuggestion(value: string): void {
		if (!this.context?.editor) {
			return;
		}

		const emoteId = this.emoteMap.get(value);
		if (!emoteId) {
			return;
		}

		const editor = this.context.editor;
		const typedRange = editor.getRange(this.context.start, this.context.end);
		const hasTrailingColon = typedRange.endsWith(':');
		const deleteEnd = hasTrailingColon ? { ...this.context.end } : this.context.end;

		editor.replaceRange('', this.context.start, deleteEnd);
		void this.plugin.insertEmoteByStrategy(editor, value, emoteId);
	}
}
