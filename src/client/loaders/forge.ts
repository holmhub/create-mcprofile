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

/**
 * Retrieves and caches Forge loader version metadata from the Maven repository.
 *
 * Checks for a cached JSON file in the specified root directory. If not present, fetches the metadata from the Forge Maven repository, parses available version entries, filters out invalid data, and caches the result for future use.
 *
 * @param root - The root directory where the cache should be stored.
 * @returns An array of objects containing Minecraft and Forge loader version pairs.
 */
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

/**
 * Returns a sorted list of unique Minecraft game versions available for Forge.
 *
 * The versions are sorted in descending order by major, minor, and patch numbers, and each entry is marked as stable.
 *
 * @param root - The root directory used for caching Forge metadata.
 * @returns An array of game version objects with `version` and `stable` properties.
 */
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

/**
 * Retrieves all Forge loader versions available for a specific Minecraft version.
 *
 * @param root - The root directory used for caching Forge metadata.
 * @param mcVersion - The Minecraft version to filter Forge loader versions by.
 * @returns An array of Forge loader version strings for the specified Minecraft version.
 */
export async function getForgeLoaderVersions(root: string, mcVersion: string) {
	const versions = await getMavenMetadata(root);
	return versions
		.filter(({ version }) => version === mcVersion)
		.map((version) => version.forge);
}

/**
 * Generates the download URL for a Forge installer or universal jar based on the loader version.
 *
 * Selects the "universal" jar for legacy versions (Minecraft 1.12 and below, except 1.12.2 builds above 2847), otherwise uses the "installer" jar.
 *
 * @param loaderVersion - The Forge loader version string in the format "MCVERSION-FORGEVERSION".
 * @returns The direct URL to the appropriate Forge jar file for the specified loader version.
 */
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

/**
 * Sets up a Forge profile by downloading the appropriate installer and generating a profile JSON.
 *
 * Downloads the Forge installer jar for the specified Minecraft and Forge loader versions, generates a profile JSON using the installer, and saves it to the given directory. Returns the generated profile name.
 *
 * @param config - Configuration object containing the target directory, Minecraft game version, and Forge loader version.
 * @returns The name of the created Forge profile.
 *
 * @throws {Error} If either {@link config.loaderVersion} or {@link config.gameVersion} is missing.
 */
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
