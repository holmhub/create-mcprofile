import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fetchJsonWithRetry } from '../utils/fetch.ts';

type FabricLoaderVersion = {
	version: string;
	stable: boolean;
	separator: string;
	build: number;
	maven: string;
};

export type GameVersion = {
	version: string;
	stable: boolean;
};

export type FabricConfig = {
	directory: string;
	gameVersion?: string;
	loaderVersion?: string;
};

const FABRIC_API = 'https://meta.fabricmc.net/v2';

export function getAvailableVersions(): Promise<FabricLoaderVersion[]> {
	return fetchJsonWithRetry(`${FABRIC_API}/versions/loader`);
}

export function getFabricVersions(): Promise<GameVersion[]> {
	return fetchJsonWithRetry(`${FABRIC_API}/versions/game`);
}

export async function setupFabric(config: FabricConfig): Promise<string> {
	if (!config.loaderVersion) {
		const [latest] = await getAvailableVersions();
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
