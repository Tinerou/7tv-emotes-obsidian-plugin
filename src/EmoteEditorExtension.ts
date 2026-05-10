import {
	Decoration,
	DecorationSet,
	EditorView,
	PluginValue,
	ViewPlugin,
	ViewUpdate,
	WidgetType
} from '@codemirror/view';
import {
	Extension,
	RangeSet,
	RangeSetBuilder,
	RangeValue
} from '@codemirror/state';
import { editorLivePreviewField } from 'obsidian';
import type SevenTVPlugin from '../index';

const EMOTE_PATTERN = /<(picture|span)\b[^>]*\bclass="seven-tv-emote"[^>]*>[\s\S]*?<\/\1>/g;
const TITLE_ATTR_PATTERN = /\btitle="([^"]*)"/;
const ALT_ATTR_PATTERN = /\balt="([^"]*)"/;

interface EmoteRange {
	from: number;
	to: number;
	html: string;
	name: string;
}

class AtomicRangeValue extends RangeValue {}
const ATOMIC_VALUE = new AtomicRangeValue();

class EmoteImageWidget extends WidgetType {
	constructor(private readonly html: string) {
		super();
	}

	eq(other: WidgetType): boolean {
		return other instanceof EmoteImageWidget && other.html === this.html;
	}

	toDOM(): HTMLElement {
		const parsed = new DOMParser().parseFromString(this.html, 'text/html');
		const root = parsed.body.firstElementChild;
		if (root instanceof HTMLElement) {
			return document.adoptNode(root);
		}
		return document.createElement('span');
	}

	ignoreEvent(): boolean {
		return false;
	}
}

class EmoteTextWidget extends WidgetType {
	constructor(private readonly name: string) {
		super();
	}

	eq(other: WidgetType): boolean {
		return other instanceof EmoteTextWidget && other.name === this.name;
	}

	toDOM(): HTMLElement {
		const span = document.createElement('span');
		span.textContent = `:${this.name}:`;
		return span;
	}

	ignoreEvent(): boolean {
		return false;
	}
}

function decodeAttr(value: string): string {
	return value
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&');
}

function extractEmoteName(html: string): string {
	const titleMatch = html.match(TITLE_ATTR_PATTERN);
	if (titleMatch) {
		const stripped = decodeAttr(titleMatch[1]).replace(/^:|:$/g, '');
		if (stripped.length > 0) {
			return stripped;
		}
	}
	const altMatch = html.match(ALT_ATTR_PATTERN);
	if (altMatch) {
		const stripped = decodeAttr(altMatch[1]).replace(/^:|:$/g, '');
		if (stripped.length > 0) {
			return stripped;
		}
	}
	return 'emote';
}

function findEmoteRanges(view: EditorView): EmoteRange[] {
	const ranges: EmoteRange[] = [];
	const doc = view.state.doc;
	for (const { from, to } of view.visibleRanges) {
		const text = doc.sliceString(from, to);
		EMOTE_PATTERN.lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = EMOTE_PATTERN.exec(text)) !== null) {
			const html = match[0];
			const start = from + match.index;
			const end = start + html.length;
			ranges.push({ from: start, to: end, html, name: extractEmoteName(html) });
		}
	}
	return ranges;
}

function buildDecorationSet(view: EditorView, ranges: EmoteRange[]): DecorationSet {
	if (ranges.length === 0) {
		return Decoration.none;
	}
	const sel = view.state.selection.main;
	const builder = new RangeSetBuilder<Decoration>();
	for (const range of ranges) {
		const focused = sel.from <= range.to && sel.to >= range.from;
		const widget = focused
			? new EmoteTextWidget(range.name)
			: new EmoteImageWidget(range.html);
		builder.add(range.from, range.to, Decoration.replace({ widget, inclusive: false }));
	}
	return builder.finish();
}

export function buildEmoteEditorExtension(plugin: SevenTVPlugin): Extension {
	class EmoteViewPlugin implements PluginValue {
		decorations: DecorationSet = Decoration.none;
		ranges: EmoteRange[] = [];

		constructor(view: EditorView) {
			this.rebuild(view);
		}

		update(update: ViewUpdate): void {
			if (update.docChanged || update.viewportChanged || update.selectionSet) {
				this.rebuild(update.view);
			}
		}

		private rebuild(view: EditorView): void {
			if (!plugin.settings.compactEditorDisplay || !view.state.field(editorLivePreviewField)) {
				this.ranges = [];
				this.decorations = Decoration.none;
				return;
			}
			this.ranges = findEmoteRanges(view);
			this.decorations = buildDecorationSet(view, this.ranges);
		}
	}

	const viewPlugin = ViewPlugin.fromClass(EmoteViewPlugin, {
		decorations: (instance) => instance.decorations
	});

	const atomicRanges = EditorView.atomicRanges.of((view) => {
		const instance = view.plugin(viewPlugin);
		if (!instance || instance.ranges.length === 0) {
			return RangeSet.empty;
		}
		const builder = new RangeSetBuilder<AtomicRangeValue>();
		for (const range of instance.ranges) {
			builder.add(range.from, range.to, ATOMIC_VALUE);
		}
		return builder.finish();
	});

	return [viewPlugin, atomicRanges];
}
