import { LogLevel } from './types';

const LEVEL_RANK: Record<LogLevel, number> = {
	none: 0,
	basic: 1,
	verbose: 2,
	debug: 3
};

export class PluginLogger {
	constructor(private readonly getLogLevel: () => LogLevel) {}

	log(message: string, level: LogLevel = 'basic'): void {
		if (!this.shouldLog(level)) {
			return;
		}
		console.log(`[7TV] ${message}`);
	}

	warn(message: string): void {
		if (!this.shouldLog('basic')) {
			return;
		}
		console.warn(`[7TV] ${message}`);
	}

	error(message: string): void {
		console.error(`[7TV] ${message}`);
	}

	private shouldLog(level: LogLevel): boolean {
		const activeLevel = this.getLogLevel();
		return LEVEL_RANK[activeLevel] >= LEVEL_RANK[level] && activeLevel !== 'none';
	}
}
