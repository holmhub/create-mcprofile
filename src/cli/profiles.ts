import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { setupFabric } from '@/client/loaders/fabric';
import { setupForge } from '@/client/loaders/forge.ts';
import { confirm, note, select, spinner, text } from '@clack/prompts';
import { getLoader } from './loader.ts';
import { selectRAMAllocation } from './ram.ts';
import type { LauncherSettings, LoaderType, ProfileSettings } from './types.ts';
import { saveIniFile } from './utils/ini.ts';
import { selectMinecraftVersion } from './versions.ts';
import { createShortcut } from '@/client/core/launch.ts';
import { getOS } from '@/client/utils/system.ts';

export async function selectProfile(
	settings: LauncherSettings
): Promise<string> {
	mkdirSync(settings.ProfilesDirectory, { recursive: true });

	const existingProfiles = readdirSync(settings.ProfilesDirectory, {
		withFileTypes: true,
	})
		.filter((dirent) => dirent.isDirectory())
		.map(({ name }) => ({ value: name, label: name }));

	let profile: string | undefined;
	while (profile === 'create' || !profile) {
		profile = (await select<string>({
			message: 'Select Minecraft version',
			options: [
				...existingProfiles,
				{ value: 'create', label: 'Create new profile 🌟' },
			],
		})) as string;
		// Create new profile if selected
		if (profile === 'create') profile = await createNewProfile(settings);
	}
	return profile;
}

/**
 * Guides the user through creating a new Minecraft launcher profile with a selected mod loader, version, and RAM allocation.
 *
 * Prompts the user to choose a loader type (Vanilla, Forge, or Fabric), select a compatible Minecraft version, specify RAM allocation, and provide a unique profile name. For Fabric and Forge loaders, downloads and sets up the appropriate loader in the new profile directory. Saves the profile configuration to an INI file and returns the profile name if creation is successful.
 *
 * @param declaredName - Optional profile name to use without prompting the user.
 * @returns The name of the newly created profile, or `undefined` if the creation is canceled.
 */
export async function createNewProfile(
	settings: LauncherSettings,
	declaredName?: string
): Promise<string | undefined> {
	// Select loader type
	const loader = (await select({
		message: 'Select loader',
		options: [
			{ value: 'vanilla', label: 'Vanilla' },
			{ value: 'forge', label: 'Forge' },
			{ value: 'fabric', label: 'Fabric' },
			// { value: 'quilt', label: 'Quilt' },
		],
	})) as LoaderType;

	const version = await selectMinecraftVersion(settings, loader);

	// Mod loader selection
	const loaderVersion = await getLoader(
		loader,
		version,
		settings.GameDirectory
	);

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
	const confirmed = await confirm({
		message: 'Would you like to create this profile?',
	});

	if (!confirmed) return;

	await createProfileSettings(
		settings.ProfilesDirectory,
		profileName,
		loader,
		version,
		loaderVersion || '',
		ram
	);

	return profileName;
}

/**
 * Creates profile settings for a given profile directory.
 *
 * @param directory - The base directory where profiles are stored
 * @param profile - The name of the profile to create
 * @param loader - The type of mod loader to use
 * @param version - The Minecraft version
 * @param loaderVersion - The version of the mod loader
 * @param ram - The RAM allocation for the profile
 */
export async function createProfileSettings(
	directory: string,
	profile: string,
	loader: LoaderType,
	version: string,
	loaderVersion: string,
	ram: string,
	icon?: string
) {
	const profilePath = join(directory, profile);
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
	} else if (loader === 'forge') {
		const s = spinner();
		s.start('Downloading Forge...');
		loaderManifest = await setupForge({
			directory: profilePath,
			gameVersion: version,
			loaderVersion,
		});
		s.stop('Forge downloaded successfully! ✨');
	}

	// Save profile settings
	const profileSettings: ProfileSettings = {
		Version: version,
		...(loaderManifest && { LoaderManifest: loaderManifest }),
		RAM: ram,
	};

	// Create desktop shortcut for Windows
	if (getOS() === 'windows') {
		createShortcut(directory, profile, icon);
	}

	saveIniFile(profileSettings, join(profilePath, 'profile-settings.ini'));
}
