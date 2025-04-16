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

export function getFabricLoaderVersions(): Promise<FabricLoaderVersion[]> {
	return fetchJsonWithRetry(`${FABRIC_API}/versions/loader`);
}

export function getFabricGameVersions(): Promise<GameVersion[]> {
	return fetchJsonWithRetry(`${FABRIC_API}/versions/game`);
}

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
