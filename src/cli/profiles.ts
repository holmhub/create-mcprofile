import { note, select, spinner, text } from '@clack/prompts';
import type { LauncherSettings, LoaderType, ProfileSettings } from './types.ts';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { getAvailableVersions, setupFabric } from '@/client/loaders/fabric';
import { join } from 'node:path';
import { saveIniFile } from './utils/ini.ts';
import { formatInColumns } from './utils/format.ts';
import { selectRAMAllocation } from './ram.ts';
import { selectMinecraftVersion } from './versions.ts';

export async function selectProfile(
	settings: LauncherSettings
): Promise<string> {
	mkdirSync(settings.ProfilesDirectory, { recursive: true });
	const existingProfiles = readdirSync(settings.ProfilesDirectory, {
		withFileTypes: true,
	})
		.filter((dirent) => dirent.isDirectory())
		.map(({ name }) => ({ value: name, label: name }));
	let profile: string | undefined = (await select<string>({
		message: 'Select Minecraft version',
		options: [
			...existingProfiles,
			{ value: 'create', label: 'Create new profile 🌟' },
		],
	})) as string;

	// Create new profile if selected
	if (profile === 'create') {
		while (profile === 'create' || !profile) {
			profile = await createNewProfile(settings);
		}
	}
	return profile;
}

export async function createNewProfile(
	settings: LauncherSettings,
	declaredName?: string
): Promise<string | undefined> {
	// Select loader type
	const loader = (await select({
		message: 'Select loader',
		options: [
			{ value: 'vanilla', label: 'Vanilla' },
			{ value: 'fabric', label: 'Fabric' },
			// { value: 'forge', label: 'Forge' },
			// { value: 'quilt', label: 'Quilt' },
		],
	})) as LoaderType;

	let version = (await select<string>({
		message: 'Select Minecraft version to install',
		options: [
			{ value: '1.20.1', label: '1.20.1 (Latest Release)' },
			{ value: '1.19.4', label: '1.19.4' },
			{ value: '1.18.2', label: '1.18.2' },
			{ value: '1.17.1', label: '1.17.1' },
			{ value: '1.16.5', label: '1.16.5 (Most Modded)' },
			{ value: '1.12.2', label: '1.12.2 (Classic Modded)' },
			{ value: '1.8.9', label: '1.8.9 (PvP Classic)' },
			{ value: '1.7.10', label: '1.7.10 (Legacy Modded)' },
			{ value: 'other', label: 'Other' },
		],
	})) as string;
	if (version === 'other') {
		version = await selectMinecraftVersion(settings, loader);
	}

	// Mod loader selection
	let loaderVersion: string | undefined;
	if (loader === 'fabric') {
		const fabricVersions = await getAvailableVersions();
		const filteredVersions = fabricVersions.map((v) => v.version);

		note(
			formatInColumns(filteredVersions, {
				columns: 5,
				header: '📦 Available Fabric Versions:',
				padding: 15,
			})
		);

		// Prompt user to enter specific version number
		// Validate that input is not empty and exists in the manifest
		loaderVersion = (await text({
			message: 'Select Fabric version',
			placeholder: filteredVersions[0],
			validate(value) {
				if (!value) return 'Version number is required';
				if (!filteredVersions.includes(value))
					return 'Version not found in manifest';
			},
		})) as string;
	}

	// RAM allocation function defined below
	const ram = await selectRAMAllocation();

	// Profile name type
	const profileName =
		declaredName ||
		((await text({
			message: 'Enter profile name',
			placeholder:
				loader === 'vanilla' ? version : `${version}-${String(loader)}`,
			validate(value) {
				if (!value) return 'Profile name is required';
				if (existsSync(join(settings.ProfilesDirectory, value)))
					return 'Profile already exists';
			},
		})) as string);

	// Display profile creation summary
	note(
		[
			'📝 Profile Summary',
			'─'.repeat(20),
			`Version:        ${version}`,
			`Mod Loader:     ${String(loader)}`,
			`Loader Version: ${loaderVersion || 'N/A'}`,
			`RAM:            ${ram}`,
			`Profile Name:   ${profileName}`,
		].join('\n')
	);

	// Confirm profile creation
	const confirm = await select({
		message: 'Would you like to create this profile?',
		options: [
			{ value: true, label: 'Yes' },
			{ value: false, label: 'No' },
		],
	});

	if (!confirm) return;

	const profilePath = join(settings.ProfilesDirectory, profileName);
	mkdirSync(profilePath, { recursive: true });
	let loaderManifest: string | undefined;
	if (loader === 'fabric') {
		const s = spinner();
		s.start('Downloading Fabric...');
		loaderManifest = await setupFabric({
			directory: profilePath,
			gameVersion: version,
			loaderVersion,
		});
		s.stop('Fabric downloaded successfully! ✨');
	}

	// Save profile settings
	const profileSettings: ProfileSettings = {
		Version: version,
		LoaderManifest: loaderManifest,
		RAM: ram,
	};
	saveIniFile(profileSettings, join(profilePath, 'profile-settings.ini'));
	return profileName;
}
