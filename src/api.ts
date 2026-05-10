import { PluginLogger } from './logger';

const REQUEST_TIMEOUT_MS = 6000;

export async function fetchEmotesForTwitchId(
	twitchId: string,
	logger: PluginLogger
): Promise<Map<string, string>> {
	const emoteMap = new Map<string, string>();

	try {
		logger.log(`Fetching 7TV emotes for Twitch ID: ${twitchId}`, 'debug');

		const userData = await fetchJsonWithTimeout(
			`https://7tv.io/v3/users/twitch/${encodeURIComponent(twitchId)}`,
			REQUEST_TIMEOUT_MS
		);

		const emoteSetId = userData?.emote_set?.id ||
			(userData?.emote_sets && userData.emote_sets[0]?.id);
		if (!emoteSetId) {
			throw new Error('No emote set found');
		}

		logger.log(`Found emote set ID: ${emoteSetId}`, 'debug');

		const setData = await fetchJsonWithTimeout(
			`https://7tv.io/v3/emote-sets/${encodeURIComponent(emoteSetId)}`,
			REQUEST_TIMEOUT_MS
		);

		if (Array.isArray(setData?.emotes)) {
			for (const emote of setData.emotes) {
				if (emote?.name && emote?.id) {
					emoteMap.set(emote.name, emote.id);
				}
			}
			logger.log(`Mapped ${emoteMap.size} emotes`, 'debug');
		}
	} catch (error) {
		logger.error(`Failed to fetch 7TV emotes: ${error}`);
	}

	return emoteMap;
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<any> {
	const controller = new AbortController();
	const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(url, { signal: controller.signal });
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}
		return response.json();
	} catch (error) {
		if (error instanceof DOMException && error.name === 'AbortError') {
			throw new Error(`Request timed out after ${timeoutMs}ms`);
		}
		throw error;
	} finally {
		window.clearTimeout(timeoutId);
	}
}
