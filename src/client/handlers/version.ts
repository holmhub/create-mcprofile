import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { downloadAsync } from '../core/download.ts';
import { client } from '../index.ts';
import type {
	ILauncherOptions,
	IVersionManifest,
	VersionManifestResponse,
} from '../types.ts';
import { fetchJsonWithRetry } from '../utils/fetch.ts';

/**
 * Retrieves the version manifest for a specific Minecraft version
 * @param options Launcher configuration options
 * @throws {Error} If directory is not specified or manifest fetch fails
 * @returns {Promise<IVersionManifest>} Version manifest data
 */
export function getVersionManifest(
	options: ILauncherOptions
): Promise<IVersionManifest> {
	if (!options.directory) {
		throw new Error('No version directory specified');
	}

	const localVersionPath =
		options.overrides?.versionJson ??
		join(options.directory, `${options.version.number}.json`);

	try {
		// Try to load from local version file first
		if (existsSync(localVersionPath)) {
			const localVersion = JSON.parse(readFileSync(localVersionPath, 'utf-8'));
			client.emit('debug', `Using local version from ${localVersionPath}`);
			return localVersion;
		}

		// Fetch from manifest if local file doesn't exist
		return getVersionManifestData(options);
	} catch (error) {
		throw new Error(`Failed to get version manifest: ${error}`);
	}
}

/**
 * Downloads the Minecraft jar file and saves version manifest
 * @param options Launcher configuration options
 * @param version Version manifest containing download URLs
 * @returns {Promise<boolean>} True if download successful, false otherwise
 */
export async function getJar(
	options: ILauncherOptions,
	version: IVersionManifest
): Promise<boolean> {
	try {
		// Validate required inputs
		if (!options?.directory) {
			throw new Error('Directory is required in launcher options');
		}
		if (!version?.downloads?.client?.url) {
			throw new Error('Invalid version manifest: missing client download URL');
		}

		// Ensure directory exists
		if (!existsSync(options.directory)) {
			mkdirSync(options.directory, { recursive: true });
			client.emit('debug', `Created directory: ${options.directory}`);
		}

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
		const errorMessage = error instanceof Error ? error.message : String(error);
		client.emit('debug', `Failed to process version files: ${errorMessage}`);
		return false;
	}
}

/**
 * Parses a version string into major, minor, and patch numbers
 * @param versionId Version string in format "x.y.z" (e.g., "1.20.1")
 * @returns {{ majorVersion: number, minorVersion: number, patchVersion: number }}
 */
export function parseVersion(versionId: string | undefined) {
	const [majorVersion = 0, minorVersion = 0, patchVersion = 0] = (
		versionId || ''
	)
		.split('.')
		.map(Number.parseInt);
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
	if (!existsSync(cacheDirectory)) {
		mkdirSync(cacheDirectory, { recursive: true });
		client.emit('debug', 'Cache directory created.');
	}

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
	const { number: requestedVersion } = options.version;
	return getCachedOrFetch(options, `${requestedVersion}.json`, async () => {
		const versionsManifest = await getVersionsManifest(options);
		const targetVersion = versionsManifest.versions.find(
			({ id }) => id === requestedVersion
		);
		if (!targetVersion)
			throw new Error(`Version ${requestedVersion} not found in manifest`);
		return fetchJsonWithRetry<IVersionManifest>(targetVersion.url);
	});
}

async function getVersionsManifest(
	options: ILauncherOptions
): Promise<VersionManifestResponse> {
	return getCachedOrFetch(options, 'version_manifest.json', () =>
		fetchJsonWithRetry<VersionManifestResponse>(
			`${options.overrides?.url?.meta}/mc/game/version_manifest.json`
		)
	);
}

// /**
//  * Test Case: bun run --hot src/client/handlers/version.ts
//  */
// (async () => {
// 	client.on('debug', console.log);
// 	client.on('data', console.log);
// 	client.on('progress', console.log);

// 	const options: ILauncherOptions = {
// 		root: resolve('out'),
// 		version: {
// 			number: '1.20.1',
// 			type: '',
// 			custom: undefined,
// 		},
// 		memory: {
// 			max: '',
// 			min: '',
// 		},
// 		directory: join('out', 'versions', '1.20.1'),
// 		authorization: {
// 			access_token: '',
// 			client_token: '',
// 			uuid: '',
// 			name: '',
// 			user_properties: '',
// 		},
// 		overrides: {
// 			detached: true,
// 			url: {
// 				meta: 'https://launchermeta.mojang.com',
// 				resource: 'https://resources.download.minecraft.net',
// 				mavenForge: 'https://files.minecraftforge.net/maven/',
// 				defaultRepoForge: 'https://libraries.minecraft.net/',
// 				fallbackMaven: 'https://search.maven.org/remotecontent?filepath=',
// 			},
// 		},
// 	};

// 	const version = await getVersionManifest(options);
// 	await getJar(options, version);
// })();
