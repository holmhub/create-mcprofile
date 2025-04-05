import type { VersionInfo, VersionManifest } from './types';

const VERSION_MANIFEST_URL =
	'https://launchermeta.mojang.com/mc/game/version_manifest.json';

export async function getVersions(showAll = false): Promise<VersionInfo[]> {
	try {
		const response = await fetch(VERSION_MANIFEST_URL);
		const data = (await response.json()) as VersionManifest;

		if (!showAll) {
			return data.versions.filter((v) => v.type === 'release');
		}
		return data.versions;
	} catch (error) {
		console.error('Error fetching versions:', error);
		return [];
	}
}

export async function displayVersions(versions: VersionInfo[]) {
	console.log('\nAvailable versions:');
	versions.forEach((version, index) => {
		console.log(`${index + 1}. ${version.id} (${version.type})`);
	});
}
