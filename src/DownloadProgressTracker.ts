import type SevenTVPlugin from '../index';
import { formatBytes } from './utils';

interface ProgressDomRefs {
	batchInfo?: HTMLElement;
	progressText?: HTMLElement;
	progressPercent?: HTMLElement;
	progressBar?: HTMLElement;
	sizeText?: HTMLElement;
	speedText?: HTMLElement;
	timer?: HTMLElement;
	failedInfo?: HTMLElement;
}

export class DownloadProgressTracker {
	private totalEmotes = 0;
	private downloadedEmotes = 0;
	private failedEmotes = 0;
	private totalBytes = 0;
	private downloadedBytes = 0;
	private statusBarEl: HTMLElement | null = null;
	private isActive = false;
	private isCancelled = false;
	private startTime = 0;
	private currentBatch = 0;
	private totalBatches = 0;
	private onCancelCallback: (() => void) | null = null;
	private removalTimerId: number | null = null;
	private domRefs: ProgressDomRefs = {};
	private statusUpdateQueued = false;
	private statusRafId: number | null = null;

	constructor(
		private readonly plugin: SevenTVPlugin,
		private readonly onStateChange: () => void
	) {}

	start(totalEmotes: number, onCancel?: () => void): void {
		this.totalEmotes = totalEmotes;
		this.downloadedEmotes = 0;
		this.failedEmotes = 0;
		this.totalBytes = 0;
		this.downloadedBytes = 0;
		this.isActive = true;
		this.isCancelled = false;
		this.startTime = Date.now();
		this.currentBatch = 0;
		this.totalBatches = Math.ceil(totalEmotes / 3);
		this.onCancelCallback = onCancel ?? null;

		this.clearRemovalTimer();
		this.createStatusBar();
		this.updateStatusBar();
		this.plugin.logMessage(`Initiating download of ${totalEmotes} emotes`, 'basic');
		this.onStateChange();
	}

	setTotalBytes(bytes: number): void {
		this.totalBytes = bytes;
		this.updateStatusBar();
	}

	recordSuccess(bytes = 0): void {
		if (!this.isActive) {
			return;
		}
		this.downloadedEmotes++;
		this.downloadedBytes += bytes;
		this.updateStatusBar();
	}

	recordFailure(): void {
		if (!this.isActive) {
			return;
		}
		this.failedEmotes++;
		this.updateStatusBar();
	}

	updateBatch(batchIndex: number): void {
		if (!this.isActive) {
			return;
		}
		this.currentBatch = batchIndex;
		this.updateStatusBar();
	}

	complete(): void {
		this.isActive = false;
		if (this.statusBarEl && !this.isCancelled) {
			const totalTime = Math.floor((Date.now() - this.startTime) / 1000);
			const successRate = this.totalEmotes > 0
				? (((this.downloadedEmotes - this.failedEmotes) / this.totalEmotes) * 100).toFixed(1)
				: '0';
			const avgSpeed = totalTime > 0 ? this.downloadedBytes / totalTime : 0;

			this.statusBarEl.empty();

			const container = this.statusBarEl.createDiv({ cls: 'seven-tv-complete-container' });
			container.createDiv({ cls: 'seven-tv-complete-title', text: '✅ Download complete' });
			container.createDiv({
				cls: 'seven-tv-complete-stats1',
				text: `${this.downloadedEmotes - this.failedEmotes}/${this.totalEmotes} emotes cached`
			});
			container.createDiv({
				cls: 'seven-tv-complete-stats2',
				text: `${formatBytes(this.downloadedBytes)} total`
			});
			container.createDiv({
				cls: 'seven-tv-success-rate',
				text: `${successRate}% success in ${totalTime}s (${formatBytes(avgSpeed)}/s avg)`
			});
		}

		this.scheduleRemoval(5000);
		this.onStateChange();
	}

	cancel(): void {
		if (!this.isActive) {
			return;
		}
		this.isCancelled = true;
		this.isActive = false;
		this.plugin.logMessage('Download cancelled by user', 'basic');
		this.onCancelCallback?.();

		if (this.statusBarEl) {
			this.statusBarEl.empty();
			const container = this.statusBarEl.createDiv({ cls: 'seven-tv-cancelled-container' });
			container.createDiv({ cls: 'seven-tv-cancelled-title', text: '❌ Download cancelled' });
			container.createDiv({
				cls: 'seven-tv-cancelled-stats',
				text: `${this.downloadedEmotes - this.failedEmotes}/${this.totalEmotes} emotes cached`
			});
			container.createDiv({
				cls: 'seven-tv-cancelled-bytes',
				text: `${formatBytes(this.downloadedBytes)} downloaded`
			});
		}
		this.onStateChange();
	}

	cancelFromCommand(): void {
		if (!this.isActive) {
			return;
		}
		this.isCancelled = true;
		this.isActive = false;
		this.plugin.logMessage('Download cancelled by command', 'basic');
		this.scheduleRemoval(3000);
		this.onStateChange();
	}

	isCancelledRequested(): boolean {
		return this.isCancelled;
	}

	cleanup(): void {
		this.clearRemovalTimer();
		this.clearQueuedStatusUpdate();
		if (this.statusBarEl?.parentNode) {
			this.statusBarEl.remove();
		}
		this.statusBarEl = null;
		this.domRefs = {};
		this.isActive = false;
		this.isCancelled = false;
		this.onCancelCallback = null;
	}

	private createStatusBar(): void {
		if (!this.statusBarEl) {
			this.statusBarEl = document.createElement('div');
			this.statusBarEl.className = 'seven-tv-download-progress';
			document.body.appendChild(this.statusBarEl);
		}
		if (!this.domRefs.batchInfo) {
			this.initializeStatusBarStructure();
		}
	}

	private initializeStatusBarStructure(): void {
		if (!this.statusBarEl) {
			return;
		}

		this.statusBarEl.empty();
		this.domRefs = {};

		const header = this.statusBarEl.createDiv({ cls: 'seven-tv-progress-header' });
		header.createEl('strong', { text: '📥 7TV emote cache' });
		this.domRefs.batchInfo = header.createSpan({ cls: 'seven-tv-batch-info' });

		const progressContainer = this.statusBarEl.createDiv({ cls: 'seven-tv-progress-container' });
		const progressHeader = progressContainer.createDiv({ cls: 'seven-tv-progress-header-row' });
		this.domRefs.progressText = progressHeader.createSpan();
		this.domRefs.progressPercent = progressHeader.createSpan();

		const progressBarContainer = progressContainer.createDiv({ cls: 'seven-tv-progress-bar-container' });
		this.domRefs.progressBar = progressBarContainer.createDiv({ cls: 'seven-tv-progress-bar' });

		const sizeInfo = progressContainer.createDiv({ cls: 'seven-tv-size-info' });
		this.domRefs.sizeText = sizeInfo.createSpan();
		this.domRefs.speedText = sizeInfo.createSpan();

		const footer = this.statusBarEl.createDiv({ cls: 'seven-tv-progress-footer' });
		this.domRefs.timer = footer.createSpan({ cls: 'seven-tv-timer' });
		this.domRefs.failedInfo = footer.createSpan({ cls: 'seven-tv-failed-info seven-tv-hidden' });

		const cancelButton = footer.createEl('button', {
			cls: 'seven-tv-cancel-button mod-warning',
			text: 'Cancel'
		});
		this.plugin.registerDomEvent(cancelButton, 'click', () => this.cancel());
	}

	private updateStatusBar(): void {
		if (!this.statusBarEl || !this.isActive) {
			return;
		}

		if (this.statusUpdateQueued) {
			return;
		}

		this.statusUpdateQueued = true;
		this.statusRafId = window.requestAnimationFrame(() => {
			this.statusUpdateQueued = false;
			this.statusRafId = null;
			this.renderStatusBar();
		});
	}

	private renderStatusBar(): void {
		if (!this.statusBarEl || !this.isActive) {
			return;
		}

		const elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
		const progress = this.totalEmotes > 0
			? (this.downloadedEmotes / this.totalEmotes) * 100
			: 0;
		const speed = elapsedSeconds > 0 ? this.downloadedBytes / elapsedSeconds : 0;

		this.domRefs.batchInfo?.setText(`Batch ${this.currentBatch}/${this.totalBatches}`);
		this.domRefs.progressText?.setText(`Progress: ${this.downloadedEmotes}/${this.totalEmotes}`);
		this.domRefs.progressPercent?.setText(`${progress.toFixed(1)}%`);
		if (this.domRefs.progressBar) {
			this.domRefs.progressBar.style.setProperty('--seven-tv-progress', `${progress}%`);
		}
		this.domRefs.sizeText?.setText(`${formatBytes(this.downloadedBytes)} / ${formatBytes(this.totalBytes)}`);
		this.domRefs.speedText?.setText(`${formatBytes(speed)}/s`);
		this.domRefs.timer?.setText(`⏱️ ${elapsedSeconds}s`);

		if (this.domRefs.failedInfo) {
			const hasFailures = this.failedEmotes > 0;
			this.domRefs.failedInfo.toggleClass('seven-tv-hidden', !hasFailures);
			if (hasFailures) {
				this.domRefs.failedInfo.setText(`❌ ${this.failedEmotes} failed`);
			}
		}
	}

	private clearQueuedStatusUpdate(): void {
		if (this.statusRafId !== null) {
			window.cancelAnimationFrame(this.statusRafId);
		}
		this.statusRafId = null;
		this.statusUpdateQueued = false;
	}

	private scheduleRemoval(delayMs: number): void {
		this.clearRemovalTimer();
		this.removalTimerId = window.setTimeout(() => {
			if (this.statusBarEl?.parentNode) {
				this.statusBarEl.remove();
			}
			this.statusBarEl = null;
			this.domRefs = {};
			this.removalTimerId = null;
		}, delayMs);
	}

	private clearRemovalTimer(): void {
		if (!this.removalTimerId) {
			return;
		}
		window.clearTimeout(this.removalTimerId);
		this.removalTimerId = null;
	}
}
