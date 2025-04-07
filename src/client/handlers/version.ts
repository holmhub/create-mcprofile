import {
	existsSync,
	mkdirSync,
	readFileSync,
	writeFile,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { client } from '..';
import { downloadAsync } from '../core/download';
import type { ILauncherOptions, IVersionManifest } from '../types';

const writeFileAsync = promisify(writeFile);

export async function getVersion(
	options: ILauncherOptions,
): Promise<IVersionManifest> {
	if (!options.directory) {
		throw Error('No version directory specified');
	}

	const versionJsonPath =
		options.overrides?.versionJson ||
		join(options.directory, `${options.version.number}.json`);

	if (existsSync(versionJsonPath)) {
		const version = JSON.parse(readFileSync(versionJsonPath, 'utf-8'));
		return version;
	}

	const manifest = `${options.overrides?.url?.meta}/mc/game/version_manifest.json`;
	const cache = options.cache
		? `${options.cache}/json`
		: `${options.root}/cache/json`;

	try {
		const manifestResponse = await fetch(manifest);
		const manifestData = await manifestResponse.json();

		if (!existsSync(cache)) {
			mkdirSync(cache, { recursive: true });
			client.emit('debug', 'Cache directory created.');
		}

		await writeFileAsync(
			join(cache, 'version_manifest.json'),
			JSON.stringify(manifestData, null, 2),
		);
		client.emit('debug', 'Cached version_manifest.json');

		const desiredVersion = (
			manifestData as { versions: Array<{ id: string; url: string }> }
		).versions.find(
			(version: { id: string }) => version.id === options.version.number,
		);

		if (!desiredVersion) {
			throw Error(
				`Failed to find version ${options.version.number} in version_manifest.json`,
			);
		}

		const versionResponse = await fetch(desiredVersion.url);
		const versionData = (await versionResponse.json()) as IVersionManifest;

		await writeFileAsync(
			join(cache, `${options.version.number}.json`),
			JSON.stringify(versionData, null, 2),
		);
		client.emit('debug', `Cached ${options.version.number}.json`);
		client.emit('debug', 'Parsed version from version manifest');

		return versionData;
	} catch (error) {
		// Attempt to load from cache if network request fails
		try {
			if (
				error instanceof Error &&
				'code' in error &&
				error.code === 'ENOTFOUND'
			) {
				JSON.parse(readFileSync(join(cache, 'version_manifest.json'), 'utf-8'));
				const versionCache = JSON.parse(
					readFileSync(join(cache, `${options.version.number}.json`), 'utf-8'),
				);
				return versionCache;
			}
			throw error;
		} catch {
			throw new Error(`Failed to get version: ${error}`);
		}
	}
}

export async function getJar(
	options: ILauncherOptions,
	version: IVersionManifest,
) {
	if (!options.directory) {
		client.emit('debug', 'No version directory specified');
		return false;
	}
	await downloadAsync(
		version.downloads.client.url,
		options.directory,
		`${options.version.custom ? options.version.custom : options.version.number}.jar`,
		true,
		'version-jar',
	);
	writeFileSync(
		join(options.directory, `${options.version.number}.json`),
		JSON.stringify(version, null, 4),
	);
	return client.emit('debug', 'Downloaded version jar and wrote version json');
}

export function getMinorVersion(versionId: string): number {
	return Number.parseInt(versionId.split('.')[1] || '0');
}

export function getPatchVersion(versionId: string): number {
	return Number.parseInt(versionId.split('.')[2] || '0');
}
