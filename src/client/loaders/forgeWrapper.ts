import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DEFAULT_URLS } from '@/client/constants.ts';
import { parseVersion } from '@/client/handlers/version.ts';
import type { IVersionManifest } from '@/client/types.ts';
import { createZipReader } from '@/client/utils/extract.ts';
import { getUniqueNonNullValues } from '@/client/utils/other.ts';

const FORGE_WRAPPER = {
	baseUrl: 'https://github.com/ZekerZhayard/ForgeWrapper/releases/download/',
	version: '1.6.0',
	sh1: '035a51fe6439792a61507630d89382f621da0f1f',
	size: 28679,
};

/**
 * Determines whether the given Forge manifest corresponds to a modern Forge version.
 *
 * Modern Forge versions are defined as those for Minecraft 1.12 and above, excluding the legacy Forge 1.12.2-14.23.2847 release.
 *
 * @param json - The Forge version manifest to evaluate.
 * @returns `true` if the manifest is for a modern Forge version; otherwise, `false`.
 */
function isModernForge(json: IVersionManifest) {
	if (!json.inheritsFrom) return false;

	const { minorVersion } = parseVersion(json.inheritsFrom);
	const forgeVersion = json.id.split('.').pop();

	// Special case for Forge 1.12.2-14.23.2847
	const isLegacyForge =
		json.inheritsFrom === '1.12.2' && forgeVersion === '2847';

	// Modern Forge starts from Minecraft 1.12
	return (minorVersion ?? 0) >= 12 && !isLegacyForge;
}

/**
 * Loads an existing version manifest from disk if it exists and matches the current ForgeWrapper version.
 *
 * @param versionPath - Path to the version manifest JSON file.
 * @returns The parsed {@link IVersionManifest} if present and up-to-date; otherwise, `undefined`.
 */
function loadExistingVersion(
	versionPath: string
): IVersionManifest | undefined {
	if (!existsSync(versionPath)) return;

	try {
		const json = JSON.parse(
			readFileSync(versionPath, 'utf-8')
		) as IVersionManifest;

		if (
			json.forgeWrapperVersion &&
			json.forgeWrapperVersion === FORGE_WRAPPER.version
		)
			return json;
	} catch (e) {
		console.warn(e);
	}
	return;
}

/**
 * Extracts and parses the `version.json` and `install_profile.json` files from a Forge installer zip archive.
 *
 * @param zipFile - Path to the Forge installer zip file.
 * @returns An object containing the parsed `version` and `install_profile` JSON objects, or `undefined` if extraction fails.
 */
async function extractForgeJson(zipFile: string) {
	try {
		const archive = createZipReader(zipFile);
		const [version, install_profile] = await Promise.all([
			archive.getEntry('version.json')?.getText(),
			archive.getEntry('install_profile.json')?.getText(),
		]);

		return {
			version: version ? JSON.parse(version) : undefined,
			install_profile: install_profile
				? JSON.parse(install_profile)
				: undefined,
		};
	} catch {
		return;
	}
}

/**
 * Modifies a Forge version manifest for modern Forge versions (Minecraft 1.12+ except legacy 1.12.2) to integrate ForgeWrapper.
 *
 * Adds ForgeWrapper as a library dependency, sets the main class to the ForgeWrapper installer, and updates the Forge library's download URL for compatibility. For legacy 1.12.2, removes the Forge library entry from the manifest.
 *
 * @param json - The version manifest to modify.
 * @returns The jar ending string, either "launcher" for modern Forge or "universal" for legacy 1.12.2.
 */
function handleModernForge(json: IVersionManifest) {
	let jarEnding = 'universal';
	if (json.inheritsFrom !== '1.12.2') {
		// fwAddArgs(options);
		const fwName = `ForgeWrapper-${FORGE_WRAPPER.version}.jar`;
		const fwPathArr = [
			'io',
			'github',
			'zekerzhayard',
			'ForgeWrapper',
			FORGE_WRAPPER.version,
		];
		json.libraries.push({
			name: fwPathArr.join(':'),
			downloads: {
				artifact: {
					path: [...fwPathArr, fwName].join('/'),
					url: `${FORGE_WRAPPER.baseUrl}${FORGE_WRAPPER.version}/${fwName}`,
					sha1: FORGE_WRAPPER.sh1 || '',
					size: FORGE_WRAPPER.size || 0,
				},
			},
		});
		json.mainClass = 'io.github.zekerzhayard.forgewrapper.installer.Main';
		jarEnding = 'launcher';

		// Providing a download URL to the universal jar mavenFile so it can be downloaded properly.
		for (const library of json.mavenFiles) {
			const lib = library.name.split(':');
			if (lib[0] === 'net.minecraftforge' && lib[1]?.includes('forge')) {
				library.downloads.artifact.url =
					DEFAULT_URLS.mavenForge + library.downloads.artifact.path;
				break;
			}
		}
	} else {
		// Remove the forge dependent since we're going to overwrite the first entry anyways.
		// biome-ignore lint/nursery/useGuardForIn: <explanation>
		for (const library in json.mavenFiles) {
			const lib = json.mavenFiles[library]?.name.split(':');
			if (lib?.[0] === 'net.minecraftforge' && lib?.[1]?.includes('forge')) {
				delete json.mavenFiles[library];
				break;
			}
		}
	}

	return jarEnding;
}

/**
 * Updates library URLs in a legacy Forge version manifest to ensure compatibility with standard Maven repositories.
 *
 * For each non-Forge library, sets the URL to the default Forge Maven repository or a fallback if unavailable.
 * Skips Forge libraries and libraries lacking required fields.
 *
 * @returns The string "universal" to indicate the jar ending for legacy Forge versions.
 */
async function handleLegacyForge(json: IVersionManifest) {
	await Promise.all(
		json.libraries.map(async (library) => {
			const [org, name, version] = library.name.split(':');
			if (!(org && name && version)) return;

			if (org === 'net.minecraftforge' && name.includes('forge')) return;

			const lib = library.name.split(':');
			if (lib[0] === 'net.minecraftforge' && lib[1]?.includes('forge')) return;

			if (library.url) {
				library.url = DEFAULT_URLS.mavenForge;
			} else {
				if (!(library.serverreq || library.clientreq)) return;
				library.url = DEFAULT_URLS.defaultRepoForge;
			}

			const mavenPath = `${org.replace(/\./g, '/')}/${name}/${version}/${name}-${version}.jar`;
			const downloadLink = `${library.url}${mavenPath}`;

			// Checking if the file still exists on Forge's server, if not, replace it with the fallback.
			try {
				await fetch(downloadLink, { method: 'HEAD' });
			} catch {
				library.url = DEFAULT_URLS.fallbackMaven;
			}
		})
	);

	return 'universal';
}

/**
 * Generates or retrieves a Forge-wrapped Minecraft version manifest with ForgeWrapper integration.
 *
 * If a cached manifest exists in the specified directory, it is returned. Otherwise, the function extracts and processes the Forge installer JAR to produce a manifest compatible with ForgeWrapper, handling both modern and legacy Forge versions. The resulting manifest is saved for future reuse.
 *
 * @param directory - Directory where the version manifest and installer JAR are located.
 * @param name - Base name of the version and installer files (without extension).
 * @returns The processed version manifest with ForgeWrapper integration.
 */
export async function getForgedWrapped(
	directory: string,
	name: string
): Promise<IVersionManifest> {
	const versionPath = join(directory, `${name}.json`);
	const installerPath = join(directory, `${name}-installer.jar`);

	// Try to load existing version
	const existingJson = loadExistingVersion(versionPath);
	if (existingJson) return existingJson;

	const { version: json, install_profile: installerJson } =
		(await extractForgeJson(installerPath)) || {};

	// Adding the installer libraries as mavenFiles so MCLC downloads them but doesn't add them to the class paths.
	if (installerJson) {
		json.mavenFiles = json.mavenFiles
			? json.mavenFiles.concat(installerJson.libraries)
			: installerJson.libraries;
	}

	// Holder for the specifc jar ending which depends on the specifc forge version.
	const jarEnding = isModernForge(json)
		? handleModernForge(json)
		: await handleLegacyForge(json);

	// If a downloads property exists, we modify the inital forge entry to include ${jarEnding} so ForgeWrapper can work properly.
	// If it doesn't, we simply remove it since we're already providing the universal jar.
	if (json.libraries[0].downloads) {
		const name = json.libraries[0].name;
		if (name.includes('minecraftforge:forge') && !name.includes('universal')) {
			json.libraries[0].name = `${name}:${jarEnding}`;
			json.libraries[0].downloads.artifact.path =
				json.libraries[0].downloads.artifact.path.replace(
					'.jar',
					`-${jarEnding}.jar`
				);
			json.libraries[0].downloads.artifact.url =
				DEFAULT_URLS.mavenForge + json.libraries[0].downloads.artifact.path;
		}
	} else {
		json.libraries[0] = undefined;
	}

	// Removing duplicates and null types
	json.libraries = getUniqueNonNullValues(json.libraries);
	if (json.mavenFiles)
		json.mavenFiles = getUniqueNonNullValues(json.mavenFiles);

	json.forgeWrapperVersion = FORGE_WRAPPER.version;

	// Saving file for next run!
	if (!existsSync(dirname(versionPath))) {
		mkdirSync(dirname(versionPath), { recursive: true });
	}
	writeFileSync(versionPath, JSON.stringify(json, null, 4));

	return json;
}
