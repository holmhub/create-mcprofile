import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { downloadAsync } from '../core/download.ts';
import { parseVersion } from '../handlers/version.ts';
import type { GameVersion, LoaderConfig } from '../types.ts';
import { fetchXmlWithRetry } from '../utils/fetch.ts';
import { getForgedWrapped } from './forgeWrapper.ts';

type ForgeLoaderVersion = {
	version: string;
	forge: string;
};

async function getMavenMetadata(root: string): Promise<ForgeLoaderVersion[]> {
	const cacheDir = join(root, 'cache');
	const cachePath = join(cacheDir, 'forge-versions.json');

	if (existsSync(cachePath)) {
		return JSON.parse(readFileSync(cachePath, 'utf-8'));
	}

	const { children } = await fetchXmlWithRetry(
		'https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml'
	);
	const data = (children?.version || [])
		.map(({ value }) => {
			const [version = '', forge = ''] = value?.split('-') || [];
			return { version, forge };
		})
		.filter(({ version, forge }) => version && forge);

	if (!existsSync(cacheDir)) {
		mkdirSync(cacheDir, { recursive: true });
	}

	writeFile(cachePath, JSON.stringify(data, null, 2));
	return data;
}

export async function getForgeGameVersions(
	root: string
): Promise<GameVersion[]> {
	const data = await getMavenMetadata(root);
	const mcSet = new Set<string>();
	for (const { version } of data) {
		mcSet.add(version);
	}
	return [...mcSet]
		.sort((a, b) => {
			const {
				majorVersion: majA,
				minorVersion: minA,
				patchVersion: patA,
			} = parseVersion(a);
			const {
				majorVersion: majB,
				minorVersion: minB,
				patchVersion: patB,
			} = parseVersion(b);
			return majB - majA || minB - minA || patB - patA;
		})
		.map((version) => ({ version, stable: true }));
}

export async function getForgeLoaderVersions(root: string, mcVersion: string) {
	const versions = await getMavenMetadata(root);
	return versions
		.filter(({ version }) => version === mcVersion)
		.map((version) => version.forge);
}

function getDownloadLink(loaderVersion: string) {
	const [mcVersion] = loaderVersion.split('-');
	const [, minor = '0'] = mcVersion?.split('.') || [''];

	const isLegacyVersion =
		Number(minor) <= 12 &&
		(mcVersion !== '1.12.2' || Number(loaderVersion.split('.').pop()) <= 2847);

	const type = isLegacyVersion ? 'universal' : 'installer';
	const baseUrl = 'https://maven.minecraftforge.net/net/minecraftforge/forge';

	return `${baseUrl}/${loaderVersion}/forge-${loaderVersion}-${type}.jar`;
}

export async function setupForge(config: LoaderConfig): Promise<string> {
	if (!(config.loaderVersion && config.gameVersion)) {
		throw new Error('Missing version configuration');
	}

	const profileName = `forge-${config.gameVersion}-${config.loaderVersion}`;
	const profilePath = join(config.directory, `${profileName}.json`);

	const versionUrl = getDownloadLink(
		`${config.gameVersion}-${config.loaderVersion}`
	);

	const profileInstallerName = `${profileName}-installer.jar`;
	await downloadAsync(
		versionUrl,
		config.directory,
		profileInstallerName,
		true,
		'forge-jar'
	);

	const profile = await getForgedWrapped(config.directory, profileName);

	mkdirSync(dirname(profilePath), { recursive: true });
	writeFileSync(profilePath, JSON.stringify(profile, null, 2));

	return profileName;
}

// (async () => {
// 	await setupForge({
// 		directory: 'E:/Users/Nicat/AppData/Roaming/ModrinthApp/profiles/1.20.1',
// 		gameVersion: '1.20.1',
// 		loaderVersion: '47.4.0',
// 	});
// 	// const mcvers = await getForgeAvailableVersions('out');
// 	// const mcver = mcvers[0]!.version;
// 	// const forgevers = await getForgeVersions('out', mcver);
// 	// const forgever = forgevers[0]!;
// 	// console.log(getDownloadLink(`${mcver}-${forgever}`));
// 	// mkdirSync('out', { recursive: true });
// 	// await writeFile(join('out', 'forge.json'), JSON.stringify(forgever, null, 2));
// })();
