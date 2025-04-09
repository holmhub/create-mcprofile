import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { downloadAsync } from '../core/download.ts';
import { client } from '../index.ts';
import type {
	ILauncherOptions,
	IVersionManifest,
	VersionManifestResponse,
} from '../types.ts';
import { fetchJsonWithRetry } from '../utils/fetch.ts';
import { getErrorMessage } from '../utils/other.ts';

const ERRORS = {
	NO_DIRECTORY: 'Directory is required in launcher options',
	NO_DOWNLOAD_URL: 'Invalid version manifest: missing client download URL',
	VERSION_NOT_FOUND: (version: string) =>
		`Version ${version} not found in manifest`,
	MANIFEST_FETCH_FAILED: (error: unknown) =>
		`Failed to get version manifest: ${getErrorMessage(error)}`,
	GET_JAR_FAILED: (error: unknown) =>
		`Failed to process version files: ${getErrorMessage(error)}`,
	CUSTOM_VERSION_FAILED: (error: unknown) =>
		`Failed to load custom version file: ${getErrorMessage(error)}`,
};

/**
 * Retrieves the version manifest for a specific Minecraft version
 */
export function getVersionManifest(
	options: ILauncherOptions
): Promise<IVersionManifest> {
	if (!options.directory) throw new Error(ERRORS.NO_DIRECTORY);

	const versionPath =
		options.overrides?.versionJson ??
		join(options.directory, `${options.version.number}.json`);

	try {
		// Try to load from local version file first
		if (existsSync(versionPath)) {
			const localVersion = JSON.parse(readFileSync(versionPath, 'utf-8'));
			client.emit('debug', `Using local version from ${versionPath}`);
			return localVersion;
		}

		// Fetch from manifest if local file doesn't exist
		return getVersionManifestData(options);
	} catch (error) {
		throw new Error(ERRORS.MANIFEST_FETCH_FAILED(error));
	}
}

/**
 * Downloads the Minecraft jar file and saves version manifest
 */
export async function getJar(
	options: ILauncherOptions,
	version: IVersionManifest
): Promise<boolean> {
	try {
		// Validate required inputs
		if (!options?.directory) throw new Error(ERRORS.NO_DIRECTORY);
		if (!version?.downloads?.client?.url)
			throw new Error(ERRORS.NO_DOWNLOAD_URL);

		// Ensure directory exists
		mkdirSync(options.directory, { recursive: true });

		// Prepare file paths
		const jarFileName = options.version.custom ?? options.version.number;
		const jarPath = join(options.directory, `${jarFileName}.jar`);
		const jsonPath = join(options.directory, `${options.version.number}.json`);

		// Download and save files
		await Promise.all([
			downloadAsync(
				version.downloads.client.url,
				options.directory,
				`${jarFileName}.jar`,
				true,
				'version-jar'
			),
			writeFile(jsonPath, JSON.stringify(version, null, 2)),
		]);

		client.emit(
			'debug',
			`Successfully processed version files:
			- JAR: ${jarPath}
			- JSON: ${jsonPath}`
		);

		return true;
	} catch (error) {
		client.emit('debug', ERRORS.GET_JAR_FAILED(error));
		return false;
	}
}

/**
 * Loads and parses a custom version manifest file
 * @throws Error if file reading or parsing fails
 */
export async function getCustomVersionManifest(
	options: ILauncherOptions
): Promise<IVersionManifest | undefined> {
	if (!options.version.custom) {
		client.emit('debug', 'No custom version specified');
		return;
	}

	const customVersionPath = join(
		options.root,
		'versions',
		options.version.custom,
		`${options.version.custom}.json`
	);

	try {
		if (!existsSync(customVersionPath)) {
			client.emit(
				'debug',
				`Custom version file not found: ${customVersionPath}`
			);
			return;
		}

		const fileContent = await readFile(customVersionPath, 'utf-8');
		const manifest = JSON.parse(fileContent) as IVersionManifest;

		client.emit('debug', 'Successfully loaded custom version file');
		return manifest;
	} catch (error) {
		client.emit('debug', ERRORS.CUSTOM_VERSION_FAILED(error));
		return;
	}
}

/**
 * Parses a version string into major, minor, and patch numbers
 */
export function parseVersion(versionId = '') {
	const [majorVersion = 0, minorVersion = 0, patchVersion = 0] = versionId
		.split('.')
		.map((i) => Number.parseInt(i));
	return { majorVersion, minorVersion, patchVersion };
}

function resolveCachePath(options: ILauncherOptions): string {
	return options.cache ? `${options.cache}/json` : `${options.root}/cache/json`;
}

async function getCachedOrFetch<T>(
	options: ILauncherOptions,
	fileName: string,
	fetchFn: () => Promise<T>
): Promise<T> {
	const cacheDirectory = resolveCachePath(options);
	mkdirSync(cacheDirectory, { recursive: true });

	const cachePath = join(cacheDirectory, fileName);

	// Try to load from cache first
	if (existsSync(cachePath)) {
		client.emit('debug', `Using cached ${fileName}`);
		return JSON.parse(readFileSync(cachePath, 'utf-8'));
	}

	// Fetch and cache if not found
	const data = await fetchFn();
	await writeFile(cachePath, JSON.stringify(data, null, 2));
	client.emit('debug', `Cached ${fileName}`);

	return data;
}

async function getVersionManifestData(
	options: ILauncherOptions
): Promise<IVersionManifest> {
	const { number: version } = options.version;
	return getCachedOrFetch(options, `${version}.json`, async () => {
		const manifest = await getVersionsManifest(options);
		const target = manifest.versions.find(({ id }) => id === version);
		if (!target) throw new Error(ERRORS.VERSION_NOT_FOUND(version));
		return fetchJsonWithRetry<IVersionManifest>(target.url);
	});
}

export async function getVersionsManifest(
	options: ILauncherOptions
): Promise<VersionManifestResponse> {
	return getCachedOrFetch(options, 'version_manifest.json', () =>
		fetchJsonWithRetry<VersionManifestResponse>(
			`${options.overrides?.url?.meta || 'https://launchermeta.mojang.com'}/mc/game/version_manifest.json`
		)
	);
}

// (async () => {
// 	client.on('debug', console.log);
// 	client.on('data', console.log);
// 	const { handleProgress } = await import('@/utils/progress.ts');
// 	client.on('progress', handleProgress);
// 	const { initializeLauncherOptions } = await import('@/client/core/launch.ts');
// 	const options = initializeLauncherOptions({
// 		root: 'out',
// 		version: {
// 			number: '1.7.5',
// 		},
// 	});
// 	const version = await getVersionManifest(options);
// 	await getJar(options, version);
// })();
