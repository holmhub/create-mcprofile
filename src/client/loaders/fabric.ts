import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { GameVersion, LoaderConfig } from '../types.ts';
import { fetchJsonWithRetry } from '../utils/fetch.ts';

type FabricLoaderVersion = {
	version: string;
	stable: boolean;
	separator: string;
	build: number;
	maven: string;
};

const FABRIC_API = 'https://meta.fabricmc.net/v2';

/**
 * Retrieves the list of available Fabric loader versions from the FabricMC metadata API.
 *
 * @returns A promise that resolves to an array of {@link FabricLoaderVersion} objects.
 */
export function getFabricLoaderVersions(): Promise<FabricLoaderVersion[]> {
	return fetchJsonWithRetry(`${FABRIC_API}/versions/loader`);
}

/**
 * Retrieves the list of available Minecraft game versions supported by Fabric.
 *
 * @returns A promise that resolves to an array of {@link GameVersion} objects.
 */
export function getFabricGameVersions(): Promise<GameVersion[]> {
	return fetchJsonWithRetry(`${FABRIC_API}/versions/game`);
}

/**
 * Sets up a Fabric loader profile JSON file for the specified Minecraft game and loader versions.
 *
 * If {@link config.loaderVersion} is not provided, the latest available loader version is used.
 * The function fetches the corresponding Fabric loader profile from the FabricMC API and writes it to the specified directory.
 *
 * @param config - Configuration specifying the target directory, and optionally the game and loader versions.
 * @returns The generated profile name in the format `fabric-{gameVersion}-{loaderVersion}`.
 *
 * @throws {Error} If either the loader version or game version is missing after attempting to resolve them.
 */
export async function setupFabric(config: LoaderConfig): Promise<string> {
	if (!config.loaderVersion) {
		const [latest] = await getFabricLoaderVersions();
		config.loaderVersion = latest?.version;
	}

	if (!(config.loaderVersion && config.gameVersion)) {
		throw new Error('Missing version configuration');
	}

	const profile = await fetchJsonWithRetry(
		`${FABRIC_API}/versions/loader/${config.gameVersion}/${config.loaderVersion}/profile/json`
	);

	const profileName = `fabric-${config.gameVersion}-${config.loaderVersion}`;
	const profilePath = join(config.directory, `${profileName}.json`);

	mkdirSync(dirname(profilePath), { recursive: true });
	writeFileSync(profilePath, JSON.stringify(profile, null, 2));
	return profileName;
}

// (async () => {
// 	// console.log(await getAvailableVersions());
// 	// console.log(
// 	// 	await setupFabric({
// 	// 		rootPath: 'out',
// 	// 		gameVersion: '1.20.2',
// 	// 		loaderVersion: '0.15.4',
// 	// 	})
// 	// );
// })();
