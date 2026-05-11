import { Editor, normalizePath, Notice, Plugin, requestUrl } from 'obsidian';
import { fetchEmotesForTwitchId } from './src/api';
import { DownloadProgressTracker } from './src/DownloadProgressTracker';
import { buildEmoteEditorExtension } from './src/EmoteEditorExtension';
import { EmoteSuggest } from './src/EmoteSuggest';
import { PluginLogger } from './src/logger';
import { SettingsTab } from './src/SettingsTab';
import {
	createNoCacheEmoteHtml,
	createOnDemandEmoteHtml
} from './src/utils';
import {
	DEFAULT_SETTINGS,
	LogLevel,
	SevenTVSettings,
	StreamerDefinition
} from './src/types';

export default class SevenTVPlugin extends Plugin {
	settings: SevenTVSettings = DEFAULT_SETTINGS;

	private readonly CACHE_DIR = '_7tv-emotes-cache';
	private emoteSuggest!: EmoteSuggest;
	private logger!: PluginLogger;
	private downloadTracker!: DownloadProgressTracker;
	private activeDownloadPromise: Promise<void> | null = null;
	private preCacheComplete = false;
	private abortController: AbortController | null = null;
	private readonly stateListeners = new Set<() => void>();
	private startupRefreshInFlight = false;
	private readonly pendingTimeouts = new Set<number>();

	async onload(): Promise<void> {
		await this.loadSettings();
		this.logger = new PluginLogger(() => this.settings.logLevel);
		this.downloadTracker = new DownloadProgressTracker(this, () => this.notifyStateChange());

		this.register(() => this.downloadTracker.cleanup());
		this.register(() => this.abortController?.abort());
		this.register(() => {
			for (const timeoutId of this.pendingTimeouts) {
				window.clearTimeout(timeoutId);
			}
			this.pendingTimeouts.clear();
		});

		if (!this.settings.builtInStreamers.length) {
			const streamers = await this.loadStreamersFromJson();
			if (streamers.length) {
				this.settings.builtInStreamers = streamers;
				await this.saveSettings();
			}
		}

		await this.ensureCacheInitialized();

		this.emoteSuggest = new EmoteSuggest(this.app, this);
		this.registerEditorSuggest(this.emoteSuggest);
		this.registerEditorExtension(buildEmoteEditorExtension(this));

		const activeId = this.getActiveTwitchId();
		if (activeId) {
			void this.refreshEmotesOnStartup(activeId, true);
			this.registerDomEvent(window, 'online', () => {
				if (this.getEmoteCount() > 0) {
					return;
				}
				void this.refreshEmotesOnStartup(activeId, false);
			});
		}

		this.addCommand({
			id: 'cancel-pre-cache',
			name: 'Cancel active pre-cache download',
			checkCallback: (checking: boolean) => {
				const canCancel = this.isPreCaching() &&
					!!this.abortController &&
					!this.abortController.signal.aborted;

				if (checking) {
					return canCancel;
				}

				if (!canCancel) {
					new Notice('No active pre-cache to cancel');
					return false;
				}

				this.cancelPreCache();
				new Notice('Pre-cache cancelled');
				this.logMessage('Pre-cache cancelled via command', 'basic');
				return true;
			}
		});

		this.addSettingTab(new SettingsTab(this.app, this));
		this.logMessage('Plugin loaded successfully', 'basic');
	}

	onunload(): void {
		this.cancelPreCache();
		this.logMessage('Plugin unloaded', 'basic');
	}

	onStateChange(listener: () => void): () => void {
		this.stateListeners.add(listener);
		return () => this.stateListeners.delete(listener);
	}

	getStreamerDisplayMap(): Map<string, string> {
		return new Map(this.settings.builtInStreamers.map((s) => [s.internalKey, s.displayName]));
	}

	getStreamerIdMap(): Map<string, string> {
		return new Map(this.settings.builtInStreamers.map((s) => [s.internalKey, s.twitchId]));
	}

	getActiveTwitchId(): string | null {
		const manualId = this.settings.twitchUserId.trim();
		if (manualId) {
			return manualId;
		}
		if (!this.settings.selectedStreamerId) {
			return null;
		}
		return this.getStreamerIdMap().get(this.settings.selectedStreamerId) ?? null;
	}

	getCacheDir(): string {
		return this.CACHE_DIR;
	}

	getEmoteCount(): number {
		return this.emoteSuggest?.getEmoteCount() ?? 0;
	}

	getEmoteMap(): Map<string, string> {
		return this.emoteSuggest?.getEmoteMap() ?? new Map();
	}

	logMessage(message: string, level: LogLevel = 'basic'): void {
		this.logger?.log(message, level);
	}

	resetPreCacheStatus(): void {
		this.preCacheComplete = false;
		this.notifyStateChange();
	}

	isPreCacheComplete(): boolean {
		return this.preCacheComplete;
	}

	async refreshEmotesForUser(twitchId: string): Promise<void> {
		this.logMessage(`Fetching emotes for Twitch ID: ${twitchId}`, 'basic');
		const emoteMap = await fetchEmotesForTwitchId(twitchId, this.logger);
		this.emoteSuggest.updateEmoteMap(emoteMap);

		if (emoteMap.size === 0) {
			this.logger.warn(`No emotes found for user ${twitchId}`);
		} else {
			this.logMessage(`Loaded ${emoteMap.size} emotes`, 'basic');
		}

		this.preCacheComplete = false;
		this.notifyStateChange();
	}

	async insertEmoteByStrategy(editor: Editor, name: string, id: string): Promise<void> {
		if (this.settings.cacheStrategy === 'no-cache') {
			editor.replaceSelection(createNoCacheEmoteHtml(name, id));
			return;
		}

		await this.insertWithOnDemandCache(editor, name, id);
	}

	async ensureCacheInitialized(): Promise<void> {
		if (this.settings.cacheStrategy === 'no-cache') {
			return;
		}
		await this.initializeCache();
	}

	hasLoadedEmotes(): boolean {
		return this.getEmoteCount() > 0;
	}

	async triggerPreCache(): Promise<void> {
		const emoteMap = this.getEmoteMap();
		if (emoteMap.size === 0) {
			throw new Error('No emotes loaded to cache');
		}

		this.preCacheComplete = false;
		this.abortController = this.createAbortController();
		this.activeDownloadPromise = this.preCacheEmoteSet(emoteMap)
			.then(() => {
				this.preCacheComplete = true;
				this.logMessage('Pre-cache completed', 'basic');
			})
			.catch((error: unknown) => {
				if (error instanceof DOMException && error.name === 'AbortError') {
					this.logMessage('Pre-cache cancelled', 'basic');
					return;
				}
				this.logger.error(`Pre-cache failed: ${error}`);
				throw error;
			})
			.finally(() => {
				this.activeDownloadPromise = null;
				this.abortController = null;
				this.notifyStateChange();
			});

		this.notifyStateChange();
	}

	cancelPreCache(): void {
		if (this.abortController && !this.abortController.signal.aborted) {
			this.abortController.abort();
		}
		this.abortController = null;
		this.downloadTracker.cancelFromCommand();
		this.activeDownloadPromise = null;
		this.notifyStateChange();
	}

	isPreCaching(): boolean {
		return this.activeDownloadPromise !== null;
	}

	async loadSettings(): Promise<void> {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
		this.settings.builtInStreamers = this.settings.builtInStreamers ?? [];
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.notifyStateChange();
	}

	refreshEditorExtensions(): void {
		this.app.workspace.updateOptions();
	}

	private notifyStateChange(): void {
		for (const listener of this.stateListeners) {
			listener();
		}
	}

	private async loadStreamersFromJson(): Promise<StreamerDefinition[]> {
		try {
			const streamersPath = normalizePath(`${this.manifest.dir}/streamers.json`);
			const streamersFile = this.app.vault.getFileByPath(streamersPath);
			if (!streamersFile) {
				this.logMessage('streamers.json not found in plugin directory', 'verbose');
				return [];
			}

			const content = await this.app.vault.cachedRead(streamersFile);
			const data = JSON.parse(content);

			if (Array.isArray(data?.streamers)) {
				return data.streamers;
			}
			if (!Array.isArray(data)) {
				return [];
			}

			return data.map((item: any) => ({
				displayName: item.displayName || item[0] || '',
				twitchId: item.twitchId || item[1] || '',
				internalKey: item.internalKey || item[2] || ''
			}));
		} catch (error) {
			this.logger.error(`Failed to load streamers.json: ${error}`);
			return [];
		}
	}

	private createAbortController(): AbortController {
		if (this.abortController) {
			this.abortController.abort();
		}
		this.abortController = new AbortController();
		return this.abortController;
	}

	private async insertWithOnDemandCache(editor: Editor, name: string, id: string): Promise<void> {
		const cacheRelativePath = normalizePath(`${this.CACHE_DIR}/${id}.webp`);
		const cacheFile = this.app.vault.getFileByPath(cacheRelativePath);
		const cacheResourceUrl = cacheFile
			? this.app.vault.getResourcePath(cacheFile)
			: this.app.vault.adapter.getResourcePath(cacheRelativePath);
		const cdnUrl = `https://cdn.7tv.app/emote/${id}/1x.webp`;
		const isCached = cacheFile !== null;

		const pictureHtml = createOnDemandEmoteHtml({
			name,
			cachePath: cacheResourceUrl,
			cdnUrl,
			preferCache: isCached
		});
		editor.replaceSelection(pictureHtml);

		if (isCached) {
			return;
		}

		this.scheduleManagedTimeout(() => {
			void this.downloadToCacheOnDemand(id, cdnUrl, cacheRelativePath).catch((error: unknown) => {
				if (error instanceof DOMException && error.name === 'AbortError') {
					this.logMessage(`On-demand cache retry skipped for ${id}`, 'debug');
					return;
				}
				this.logger.warn(`On-demand cache download failed for ${id}: ${error}`);
			});
		}, 500);
	}

	private async initializeCache(): Promise<void> {
		try {
			if (this.app.vault.getFolderByPath(this.CACHE_DIR)) {
				return;
			}
			await this.app.vault.createFolder(this.CACHE_DIR);
			this.logMessage(`Cache directory created: ${this.CACHE_DIR}`, 'verbose');
		} catch (error) {
			this.logger.error(`Cache initialization error: ${error}`);
		}
	}

	private async preCacheEmoteSet(emoteMap: Map<string, string>): Promise<void> {
		const preCacheSignal = this.abortController?.signal;
		const emoteIds = Array.from(emoteMap.values());
		const totalEmotes = emoteIds.length;
		const estimatedTotalBytes = totalEmotes * 50 * 1024;
		const batchSize = 3;
		const totalBatches = Math.ceil(totalEmotes / batchSize);

		this.downloadTracker.start(totalEmotes, () => this.cancelPreCache());
		this.downloadTracker.setTotalBytes(estimatedTotalBytes);
		this.notifyStateChange();

		for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
			if (preCacheSignal?.aborted || this.downloadTracker.isCancelledRequested()) {
				throw new DOMException('Download cancelled', 'AbortError');
			}

			const start = batchIndex * batchSize;
			const end = Math.min(start + batchSize, totalEmotes);
			const batch = emoteIds.slice(start, end);

			this.downloadTracker.updateBatch(batchIndex + 1);
			const tasks = batch.map((id) =>
				this.ensureEmoteCached(id, preCacheSignal)
					.then((bytes) => this.downloadTracker.recordSuccess(bytes))
					.catch(() => this.downloadTracker.recordFailure())
			);

			await Promise.allSettled(tasks);

			await new Promise<void>((resolve) => {
				this.scheduleManagedTimeout(resolve, 50);
			});
		}

		if (!preCacheSignal?.aborted && !this.downloadTracker.isCancelledRequested()) {
			this.downloadTracker.complete();
		}
	}

	private async ensureEmoteCached(emoteId: string, signal?: AbortSignal): Promise<number> {
		const cachePath = normalizePath(`${this.CACHE_DIR}/${emoteId}.webp`);
		if (this.pathExists(cachePath)) {
			return 0;
		}

		const cdnUrl = `https://cdn.7tv.app/emote/${emoteId}/1x.webp`;
		return this.downloadToCache(emoteId, cdnUrl, cachePath, signal);
	}

	private async downloadToCacheOnDemand(emoteId: string, sourceUrl: string, destPath: string): Promise<number> {
		try {
			return await this.downloadToCache(emoteId, sourceUrl, destPath);
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				return this.downloadToCache(emoteId, sourceUrl, destPath);
			}
			throw error;
		}
	}

	private async downloadToCache(
		emoteId: string,
		sourceUrl: string,
		destPath: string,
		signal?: AbortSignal
	): Promise<number> {
		if (signal?.aborted) {
			throw new DOMException('Download cancelled', 'AbortError');
		}
		const response = await requestUrl({ url: sourceUrl, throw: false });
		if (response.status < 200 || response.status >= 300) {
			throw new Error(`HTTP ${response.status}`);
		}

		const arrayBuffer = response.arrayBuffer;
		await this.ensureCacheInitialized();
		const existingFile = this.app.vault.getFileByPath(destPath);
		if (existingFile) {
			await this.app.vault.modifyBinary(existingFile, arrayBuffer);
		} else {
			try {
				await this.app.vault.createBinary(destPath, arrayBuffer);
			} catch (error) {
				const racedFile = this.app.vault.getFileByPath(destPath);
				if (racedFile) {
					await this.app.vault.modifyBinary(racedFile, arrayBuffer);
				} else {
					throw error;
				}
			}
		}
		this.logMessage(`Cached emote ${emoteId}`, 'debug');
		return arrayBuffer.byteLength;
	}

	private pathExists(path: string): boolean {
		return this.app.vault.getAbstractFileByPath(path) !== null;
	}

	private scheduleManagedTimeout(callback: () => void, delayMs: number): number {
		const timeoutId = window.setTimeout(() => {
			this.pendingTimeouts.delete(timeoutId);
			callback();
		}, delayMs);
		this.pendingTimeouts.add(timeoutId);
		return timeoutId;
	}

	private async refreshEmotesOnStartup(twitchId: string, notifyIfOffline: boolean): Promise<void> {
		if (this.startupRefreshInFlight) {
			return;
		}

		if (typeof navigator !== 'undefined' && navigator.onLine === false) {
			if (notifyIfOffline) {
				new Notice('7TV Emotes is offline. Emotes were not refreshed. Cached emotes still work.');
			}
			this.logger.warn('Skipped startup emote refresh because app is offline');
			return;
		}

		this.startupRefreshInFlight = true;
		try {
			await this.refreshEmotesForUser(twitchId);
			if (this.getEmoteCount() === 0) {
				new Notice('7TV Emotes could not load emotes on startup. Check your connection and reload emotes in settings.');
			}
		} catch (error) {
			this.logger.warn(`Startup emote refresh failed: ${error}`);
			new Notice('7TV Emotes could not load emotes on startup. Check your connection and reload emotes in settings.');
		} finally {
			this.startupRefreshInFlight = false;
		}
	}
}
