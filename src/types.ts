export type CacheStrategy = 'on-demand' | 'no-cache';
export type LogLevel = 'none' | 'basic' | 'verbose' | 'debug';

export interface StreamerDefinition {
	displayName: string;
	twitchId: string;
	internalKey: string;
}

export interface SevenTVSettings {
	twitchUserId: string;
	selectedStreamerId: string;
	cacheStrategy: CacheStrategy;
	logLevel: LogLevel;
	builtInStreamers: StreamerDefinition[];
}

export const DEFAULT_SETTINGS: SevenTVSettings = {
	twitchUserId: '',
	selectedStreamerId: '',
	cacheStrategy: 'on-demand',
	logLevel: 'none',
	builtInStreamers: []
};
