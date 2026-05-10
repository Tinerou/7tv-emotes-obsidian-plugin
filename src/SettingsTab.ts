import {
	App,
	ButtonComponent,
	Notice,
	PluginSettingTab,
	Setting,
	TextComponent,
	TAbstractFile,
	TFile,
	TFolder
} from 'obsidian';
import type SevenTVPlugin from '../index';
import { SimpleConfirmationModal } from './SimpleConfirmationModal';
import { StreamerSuggestModal } from './StreamerSuggestModal';
import { formatBytes } from './utils';

type StatusKey = 'source' | 'emotes' | 'strategy' | 'cache' | 'preCache';

interface StatusRowRef {
	row: HTMLElement;
	value: HTMLElement;
}

export class SettingsTab extends PluginSettingTab {
	private statusDiv: HTMLElement | null = null;
	private statusRows: Partial<Record<StatusKey, StatusRowRef>> = {};
	private statusBanner: HTMLElement | null = null;
	private cacheStats = { count: 0, size: 0 };
	private preCacheButton: ButtonComponent | null = null;
	private cancelPreCacheButton: ButtonComponent | null = null;
	private clearCacheButton: ButtonComponent | null = null;
	private streamerButton: ButtonComponent | null = null;
	private manualIdInput: TextComponent | null = null;
	private unsubscribeState: (() => void) | null = null;

	constructor(app: App, private readonly plugin: SevenTVPlugin) {
		super(app, plugin);
	}

	async display(): Promise<void> {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass('seven-tv-settings-root');

		this.renderIntro(containerEl);
		this.renderStreamerSection(containerEl);
		this.renderCacheSection(containerEl);
		this.renderStatusSection(containerEl);
		this.renderAdvancedSection(containerEl);
		this.subscribeToState();

		await this.refreshStatusSection();
		this.updateActionButtons();
	}

	hide(): void {
		this.unsubscribeState?.();
		this.unsubscribeState = null;
		this.statusDiv = null;
		this.statusRows = {};
		this.statusBanner = null;
		this.preCacheButton = null;
		this.cancelPreCacheButton = null;
		this.clearCacheButton = null;
		this.streamerButton = null;
		this.manualIdInput = null;
		super.hide();
	}

	private renderIntro(containerEl: HTMLElement): void {
		containerEl.createEl('p', {
			text: 'Integrate 7TV (Twitch) emotes into your notes with auto-complete suggestions.',
			cls: 'setting-item-description'
		});
	}

	private renderStreamerSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Streamer selection').setHeading();

		const streamerSetting = new Setting(containerEl)
			.setName('Select streamer')
			.setDesc('Choose a streamer, or enter a Twitch ID directly.');

		streamerSetting.addButton((button) => {
			this.streamerButton = button;
			button
				.setButtonText(this.getStreamerButtonText())
				.onClick(() => this.openStreamerModal());
			button.buttonEl.addClass('seven-tv-streamer-select-button');
		});

		streamerSetting.addExtraButton((button) => {
			button.setIcon('cross').setTooltip('Clear selection').onClick(async () => {
				this.plugin.settings.selectedStreamerId = '';
				this.plugin.settings.twitchUserId = '';
				await this.plugin.saveSettings();
				if (this.manualIdInput) {
					this.manualIdInput.setValue('');
				}
				this.refreshStreamerButtonText();
				new Notice('Selection cleared');
			});
		});

		streamerSetting.addText((text) => {
			this.manualIdInput = text;
			text.setPlaceholder('Twitch ID');
			text.setValue(this.plugin.settings.twitchUserId);
			text.inputEl.addClass('seven-tv-manual-id-input');
			text.onChange(async (value) => {
				await this.handleManualTwitchIdChange(value);
			});
		});
	}

	private renderCacheSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Cache').setHeading();

		new Setting(containerEl)
			.setName('Cache strategy')
			.setDesc('Choose how emote images are stored locally.')
			.addDropdown((dropdown) => {
				dropdown
					.addOption('on-demand', 'On-demand cache (recommended)')
					.addOption('no-cache', 'No cache')
					.setValue(this.plugin.settings.cacheStrategy)
					.onChange(async (value: 'on-demand' | 'no-cache') => {
						if (value === this.plugin.settings.cacheStrategy) {
							return;
						}
						this.plugin.settings.cacheStrategy = value;
						await this.plugin.saveSettings();
						await this.plugin.ensureCacheInitialized();
						this.updateActionButtons();
						await this.refreshStatusSection();
						new Notice(value === 'on-demand' ? 'Switched to On-demand cache' : 'Switched to No cache');
					});
			});

		const actionSetting = new Setting(containerEl)
			.setName('Cache actions')
			.setDesc('Download emotes in advance, cancel active download, or clear cache files.');
		actionSetting.controlEl.addClass('seven-tv-cache-actions');

		actionSetting.addButton((button) => {
			this.preCacheButton = button;
			button.setButtonText('Pre-cache now').setCta().onClick(async () => {
				if (!this.plugin.hasLoadedEmotes()) {
					new Notice('No emotes loaded to cache');
					return;
				}

				const emoteCount = this.plugin.getEmoteCount();
				const estimatedSizeMB = ((emoteCount * 50) / 1024).toFixed(1);
				const message = `This will download all ${emoteCount} emotes (est. ${estimatedSizeMB}MB).\n\nThis may take a while. Continue?`;

				new SimpleConfirmationModal(this.app, message, async () => {
					new Notice('Starting pre-cache...');
					await this.plugin.triggerPreCache();
					await this.refreshStatusSection();
				}).open();
			});
		});

		actionSetting.addButton((button) => {
			this.cancelPreCacheButton = button;
			button.setButtonText('Cancel pre-cache').setWarning().onClick(async () => {
				this.plugin.cancelPreCache();
				new Notice('Pre-cache cancelled');
				await this.refreshStatusSection();
			});
		});

		actionSetting.addButton((button) => {
			this.clearCacheButton = button;
			button.setButtonText('Clear cache').onClick(async () => {
				const warningMessage = `⚠️ Warning: Clearing the cache may cause emotes to not display correctly if:

• The original CDN links change or break
• You are offline and emotes are not cached
• You switch to "No cache" mode later

Are you sure you want to clear the cache?`;

				new SimpleConfirmationModal(this.app, warningMessage, async () => {
					const cacheDir = this.plugin.getCacheDir();
					const cacheFolder = this.plugin.app.vault.getFolderByPath(cacheDir);
					if (cacheFolder) {
						await this.plugin.app.vault.delete(cacheFolder, true);
					}
					await this.plugin.ensureCacheInitialized();
					this.plugin.resetPreCacheStatus();
					await this.refreshStatusSection();
					new Notice('Cache cleared successfully');
				}).open();
			});
		});
	}

	private renderStatusSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Status').setHeading();
		this.statusDiv = containerEl.createDiv({ cls: 'seven-tv-status-box' });

		this.statusRows.source = this.createStatusRow('Current source');
		this.statusRows.emotes = this.createStatusRow('Emotes loaded');
		this.statusRows.strategy = this.createStatusRow('Cache strategy');
		this.statusRows.cache = this.createStatusRow('Cache status');
		this.statusRows.preCache = this.createStatusRow('Pre-cache');
		this.statusBanner = this.statusDiv.createDiv({ cls: 'seven-tv-status-banner seven-tv-hidden' });
		this.statusBanner.setText('⏳ Download in progress. Check the top-right corner for progress.');
	}

	private renderAdvancedSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Advanced').setHeading();
		new Setting(containerEl)
			.setName('Log level')
			.setDesc('Controls plugin console output.')
			.addDropdown((dropdown) => {
				dropdown
					.addOption('none', 'None (quiet)')
					.addOption('basic', 'Basic')
					.addOption('verbose', 'Verbose')
					.addOption('debug', 'Debug')
					.setValue(this.plugin.settings.logLevel)
					.onChange(async (value: 'none' | 'basic' | 'verbose' | 'debug') => {
						this.plugin.settings.logLevel = value;
						await this.plugin.saveSettings();
						await this.refreshStatusSection();
					});
			});
	}

	private createStatusRow(label: string): StatusRowRef {
		if (!this.statusDiv) {
			throw new Error('Status container not initialized');
		}
		const row = this.statusDiv.createDiv({ cls: 'seven-tv-status-row' });
		row.createDiv({ cls: 'seven-tv-status-label', text: label });
		const value = row.createDiv({ cls: 'seven-tv-status-value' });
		return { row, value };
	}

	private async refreshStatusSection(): Promise<void> {
		if (!this.statusDiv) {
			return;
		}

		await this.updateCacheStats();

		const activeId = this.plugin.getActiveTwitchId();
		const selectedStreamer = this.plugin.settings.selectedStreamerId;
		const streamerName = selectedStreamer
			? this.plugin.getStreamerDisplayMap().get(selectedStreamer)
			: null;
		const emoteCount = this.plugin.getEmoteCount();
		const cacheStrategy = this.plugin.settings.cacheStrategy === 'on-demand' ? 'On-demand' : 'No cache';
		const preCacheStatus = this.plugin.isPreCacheComplete()
			? 'Complete'
			: this.plugin.isPreCaching()
				? 'In progress'
				: 'Not started';

		this.setStatusValue('source', streamerName || activeId || 'None selected');
		this.setStatusValue('emotes', emoteCount > 0 ? `${emoteCount} emotes` : 'None');
		this.setStatusValue('strategy', cacheStrategy);
		this.setStatusValue('cache', `${this.cacheStats.count} emotes cached (${formatBytes(this.cacheStats.size)})`);
		this.setStatusValue('preCache', preCacheStatus);

		const showCacheRows = this.plugin.settings.cacheStrategy !== 'no-cache';
		this.toggleStatusRow('cache', showCacheRows);
		this.toggleStatusRow('preCache', showCacheRows);

		if (this.statusBanner) {
			this.statusBanner.toggleClass('seven-tv-hidden', !this.plugin.isPreCaching());
		}

		this.updateActionButtons();
	}

	private setStatusValue(key: StatusKey, value: string): void {
		const row = this.statusRows[key];
		if (row) {
			row.value.setText(value);
		}
	}

	private toggleStatusRow(key: StatusKey, visible: boolean): void {
		const row = this.statusRows[key];
		if (row) {
			row.row.toggleClass('seven-tv-hidden', !visible);
		}
	}

	private updateActionButtons(): void {
		const isNoCache = this.plugin.settings.cacheStrategy === 'no-cache';
		const hasEmotes = this.plugin.hasLoadedEmotes();
		const isPreCaching = this.plugin.isPreCaching();

		this.preCacheButton?.setDisabled(isNoCache || !hasEmotes);
		this.cancelPreCacheButton?.setDisabled(!isPreCaching);
		this.clearCacheButton?.setDisabled(isNoCache);
	}

	private async updateCacheStats(): Promise<void> {
		if (this.plugin.settings.cacheStrategy === 'no-cache') {
			this.cacheStats = { count: 0, size: 0 };
			return;
		}

		const cacheDir = this.plugin.getCacheDir();
		const cacheFolder = this.plugin.app.vault.getFolderByPath(cacheDir);
		if (!cacheFolder) {
			this.cacheStats = { count: 0, size: 0 };
			return;
		}

		const files = this.collectFiles(cacheFolder);
		const totalSize = files.reduce((size, file) => size + file.stat.size, 0);
		this.cacheStats = { count: files.length, size: totalSize };
	}

	private collectFiles(folder: TFolder): TFile[] {
		const files: TFile[] = [];
		const stack: TAbstractFile[] = [...folder.children];

		while (stack.length > 0) {
			const current = stack.pop();
			if (!current) {
				continue;
			}
			if (current instanceof TFile) {
				files.push(current);
				continue;
			}
			if (current instanceof TFolder) {
				stack.push(...current.children);
			}
		}

		return files;
	}

	private async handleManualTwitchIdChange(value: string): Promise<void> {
		const twitchId = value.trim();
		this.plugin.settings.twitchUserId = twitchId;

		if (twitchId && this.plugin.settings.selectedStreamerId) {
			this.plugin.settings.selectedStreamerId = '';
		}

		await this.plugin.saveSettings();
		this.refreshStreamerButtonText();

		if (!/^\d{6,}$/.test(twitchId)) {
			return;
		}

		try {
			await this.plugin.refreshEmotesForUser(twitchId);
			await this.refreshStatusSection();
			new Notice('Emotes loaded');
		} catch (error) {
			this.plugin.logMessage(`Failed to load emotes: ${error}`, 'verbose');
			new Notice('Failed to load emotes');
		}
	}

	private openStreamerModal(): void {
		new StreamerSuggestModal(this.app, this.plugin, async (selectedKey) => {
			const displayName = this.plugin.getStreamerDisplayMap().get(selectedKey);
			const twitchId = this.plugin.getStreamerIdMap().get(selectedKey);
			if (!twitchId) {
				new Notice('Invalid streamer selection');
				return;
			}

			this.plugin.settings.selectedStreamerId = selectedKey;
			this.plugin.settings.twitchUserId = twitchId;
			await this.plugin.saveSettings();

			if (this.manualIdInput) {
				this.manualIdInput.setValue(twitchId);
			}
			this.refreshStreamerButtonText();

			new Notice(`Fetching ${displayName}'s emotes...`);
			try {
				await this.plugin.refreshEmotesForUser(twitchId);
				await this.refreshStatusSection();
				new Notice(`${displayName}'s emotes loaded`);
			} catch (error) {
				this.plugin.logMessage(`Failed to load emotes: ${error}`, 'verbose');
				new Notice('Failed to load emotes');
			}
		}).open();
	}

	private getStreamerButtonText(): string {
		const selected = this.plugin.settings.selectedStreamerId;
		const displayName = selected
			? this.plugin.getStreamerDisplayMap().get(selected)
			: null;
		return displayName || selected || 'Select streamer...';
	}

	private refreshStreamerButtonText(): void {
		if (!this.streamerButton) {
			return;
		}
		this.streamerButton.setButtonText(this.getStreamerButtonText());
	}

	private subscribeToState(): void {
		this.unsubscribeState?.();
		this.unsubscribeState = this.plugin.onStateChange(() => {
			void this.refreshStatusSection();
		});
	}
}
