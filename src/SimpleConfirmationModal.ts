import { App, Modal, Setting } from 'obsidian';

export class SimpleConfirmationModal extends Modal {
	constructor(
		app: App,
		private readonly message: string,
		private readonly onConfirm: () => Promise<void> | void,
		private readonly onCancel?: () => void
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('seven-tv-confirm-modal');

		const messageContainer = contentEl.createDiv({ cls: 'seven-tv-modal-message-container' });
		messageContainer.appendChild(this.formatMessage(this.message));

		const actionSetting = new Setting(contentEl).setClass('seven-tv-modal-actions');
		actionSetting.addButton((button) => {
			button
				.setButtonText('Yes')
				.setCta()
				.onClick(() => {
					this.close();
					void this.onConfirm();
				});
		});
		actionSetting.addButton((button) => {
			button
				.setButtonText('No')
				.setWarning()
				.onClick(() => {
					this.close();
					this.onCancel?.();
				});
			window.requestAnimationFrame(() => button.buttonEl.focus());
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private formatMessage(message: string): DocumentFragment {
		const fragment = document.createDocumentFragment();
		const paragraphs = message.split('\n\n');

		for (const paragraph of paragraphs) {
			if (paragraph.includes('•')) {
				const ul = document.createElement('ul');
				ul.addClass('seven-tv-modal-bullet-list');

				const lines = paragraph.split('\n').filter((line) => line.trim());
				for (const line of lines) {
					const li = document.createElement('li');
					li.textContent = line.includes('•')
						? line.substring(line.indexOf('•') + 1).trim()
						: line.trim();
					ul.appendChild(li);
				}
				fragment.appendChild(ul);
				continue;
			}

			const p = document.createElement('p');
			p.addClass('seven-tv-modal-paragraph');
			const lines = paragraph.split('\n');
			lines.forEach((line, index) => {
				p.appendChild(document.createTextNode(line));
				if (index < lines.length - 1) {
					p.appendChild(document.createElement('br'));
				}
			});
			fragment.appendChild(p);
		}

		return fragment;
	}
}
