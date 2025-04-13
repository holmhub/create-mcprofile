import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { client } from '../constants.ts';
import type { ILauncherOptions } from '../types.ts';
import { downloadAsync } from './download.ts';

export async function configureLog4jForVersion(
	options: ILauncherOptions,
	jvm: string[],
	url: string
): Promise<void> {
	const gameDir = resolve(
		options.overrides?.gameDirectory ?? options.overrides?.cwd ?? options.root
	);
	const configDir = join(gameDir, 'config');
	const configFile = 'log4j2.xml';
	const configPath = join(configDir, configFile);
	const logsDir = join(gameDir, 'logs');

	// Create necessary directories
	for (const dir of [configDir, logsDir]) {
		mkdirSync(dir, { recursive: true });
	}

	// Download and configure if needed
	if (!existsSync(configPath)) {
		await downloadAsync(url, configDir, configFile, true, 'log4j');

		try {
			const content = readFileSync(configPath, 'utf8');
			const normalizedLogsPath = logsDir.replace(/\\/g, '/');
			writeFileSync(
				configPath,
				content.replace(/logs\//g, `${normalizedLogsPath}/`)
			);
		} catch (error) {
			client.emit('debug', `Failed to configure log4j: ${error}`);
		}
	}

	jvm.push(`-Dlog4j.configurationFile=${configPath}`);
}
