import type { Interface } from 'node:readline';
import type { VersionInfo, VersionManifest } from '../types';
import { getFromInput } from './input';

const VERSION_MANIFEST_URL =
	'https://launchermeta.mojang.com/mc/game/version_manifest.json';

async function getVersions(showAll = false): Promise<VersionInfo[]> {
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

export async function selectVersion(
	isSnapshot: boolean,
	title: string,
	rl: Interface,
): Promise<VersionInfo> {
	const versions = await getVersions(isSnapshot);

	// Display versions
	console.log(`${title}:`);
	versions.forEach((version, index) => {
		console.log(`${index + 1}. ${version.id} (${version.type})`);
	});

	const input = await getFromInput('Select version number: ', rl);

	const selectedVersion = versions[Number.parseInt(input) - 1];
	if (!selectedVersion) {
		throw new Error('Invalid version selected');
	}

	// Show final selection
	console.log(`${title}: ${selectedVersion.id}`);
	return selectedVersion;
}
