interface OnDemandPictureOptions {
	name: string;
	cachePath: string;
	cdnUrl: string;
	preferCache: boolean;
}

export function formatBytes(bytes: number): string {
	if (bytes === 0) {
		return '0 Bytes';
	}
	const unit = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB'];
	const index = Math.floor(Math.log(bytes) / Math.log(unit));
	return `${parseFloat((bytes / Math.pow(unit, index)).toFixed(2))} ${sizes[index]}`;
}

export function createNoCacheEmoteHtml(name: string, id: string): string {
	const safeName = escapeHtmlAttribute(name);
	const emoteUrl = `https://cdn.7tv.app/emote/${encodeURIComponent(id)}/1x.webp`;
	return `<span class="seven-tv-emote" title=":${safeName}:"><img class="seven-tv-inline-emote" loading="lazy" decoding="async" src="${escapeHtmlAttribute(emoteUrl)}" alt="${safeName}"></span>`;
}

export function createOnDemandEmoteHtml(options: OnDemandPictureOptions): string {
	const safeName = escapeHtmlAttribute(options.name);
	const cacheSource = `<source srcset="${escapeHtmlAttribute(options.cachePath)}" type="image/webp">`;
	const cdnSource = `<source srcset="${escapeHtmlAttribute(options.cdnUrl)}" type="image/webp">`;
	const sourceOrder = options.preferCache
		? `${cacheSource}${cdnSource}`
		: `${cdnSource}${cacheSource}`;

	return `<picture class="seven-tv-emote">${sourceOrder}<img class="seven-tv-inline-emote" loading="lazy" decoding="async" src="${escapeHtmlAttribute(options.cdnUrl)}" alt=":${safeName}:" title=":${safeName}:"></picture>`;
}

function escapeHtmlAttribute(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}
