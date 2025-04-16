import { getVersionsManifest } from '@/client/handlers/version.ts';
import { getFabricGameVersions } from '@/client/loaders/fabric.ts';
import { getForgeGameVersions } from '@/client/loaders/forge.ts';
import type { GameVersion } from '@/client/types.ts';
import { note, select, text } from '@clack/prompts';
import type { LauncherSettings, LoaderType } from './types.ts';
import { formatInColumns } from './utils/format.ts';

export async function selectMinecraftVersion(
	settings: LauncherSettings,
	loader?: LoaderType
) {
	const latest = (await getVanillaVersions(settings.GameDirectory)).find(
		(i) => i.stable
	) as GameVersion;
	let version = (await select<string>({
		message: 'Select Minecraft version to install',
		options: [
			{ value: latest.version, label: `${latest.version} (Latest Release)` },
			{ value: '1.20.1', label: '1.20.1' },
			{ value: '1.19.4', label: '1.19.4' },
			{ value: '1.18.2', label: '1.18.2' },
			{ value: '1.17.1', label: '1.17.1' },
			{ value: '1.16.5', label: '1.16.5' },
			{ value: '1.12.2', label: '1.12.2' },
			{ value: 'other', label: 'Other' },
		],
	})) as string;
	if (version === 'other') {
		version = await selectCustomVersion(settings, loader);
	}
	return version;
}

export async function selectCustomVersion(
	settings: LauncherSettings,
	loader?: LoaderType
): Promise<string> {
	// Let user choose between release versions only or all versions (including snapshots)
	const versionType = await select({
		message: 'Select version type',
		options: [
			{ value: 'release', label: 'Release' },
			{ value: 'all', label: 'All (including snapshots)' },
		],
	});

	const filteredVersions = await getVersions(
		settings,
		loader || 'vanilla',
		versionType as Exclude<typeof versionType, symbol>
	);

	// Display available versions in a formatted column layout
	// Use different column settings for all versions vs release only
	note(
		formatInColumns(filteredVersions, {
			columns: versionType === 'all' ? 5 : 8,
			header: `📦 Available ${versionType === 'all' ? 'All' : 'Release'} Versions:`,
			padding: versionType === 'all' ? 15 : 10,
		})
	);

	// Prompt user to enter specific version number
	// Validate that input is not empty and exists in the manifest
	const version = (await text({
		message: 'Enter version number',
		placeholder: filteredVersions[0],
		autocomplete: filteredVersions,
		validate(value) {
			if (!value) return 'Version number is required';
			if (!filteredVersions.includes(value))
				return 'Version not found in manifest';
		},
	})) as string;

	return version;
}

async function getVersions(
	settings: LauncherSettings,
	loader: LoaderType,
	versionType: 'release' | 'all' = 'release'
): Promise<string[]> {
	let versions: GameVersion[];

	switch (loader) {
		case 'fabric':
			versions = await getFabricGameVersions();
			break;
		case 'forge':
			versions = await getForgeGameVersions(settings.GameDirectory);
			break;
		default:
			versions = await getVanillaVersions(settings.GameDirectory);
	}

	return versions
		.filter((v) => v.stable === (versionType === 'release'))
		.map((v) => v.version);
}

async function getVanillaVersions(gameDir: string): Promise<GameVersion[]> {
	const { versions } = await getVersionsManifest({
		root: gameDir,
		version: { number: '' },
	});
	return versions.map((v) => ({
		version: v.id,
		stable: v.type === 'release',
	}));
}
