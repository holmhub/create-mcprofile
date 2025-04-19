import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spinner, text } from '@clack/prompts';
import { getModrinthProfile } from './platforms.ts';
import { createNewProfile, createProfileSettings } from './profiles.ts';
import type { LauncherSettings, LoaderType, ProfileSettings } from './types.ts';
import { readIniFile, saveIniFile } from './utils/ini.ts';

const USERNAME = process.env.USERNAME || 'Player';
const MC_PATH = join(process.env.APPDATA || '', '.minecraft');
const VERSIONS_PATH = join(MC_PATH, 'versions');
const SETTINGS_FILE = 'settings.ini';
const SETTINGS_PATH = resolve(
	join(process.env.USERPROFILE || '', '.mcprofile', SETTINGS_FILE)
);

export async function getLauncherSettings(): Promise<LauncherSettings> {
	if (existsSync(SETTINGS_PATH)) {
		const s = spinner();
		s.start('Loading existing settings...');
		s.stop(`Settings loaded from ${SETTINGS_PATH}`);
		return readIniFile<LauncherSettings>(SETTINGS_PATH);
	}

	// Username input
	const name = (await text({
		message: 'Enter your Name',
		placeholder: USERNAME,
		validate(value) {
			if (value.length < 3) return 'Username must be at least 3 characters.';
			if (value.length > 16) return 'Username must be less than 16 characters.';
			if (!/^[a-zA-Z0-9_]+$/.test(value))
				return 'Username can only contain letters, numbers, and underscores.';
		},
	})) as string;

	// Game directory input
	const gameDirectory = (await text({
		message: 'Enter game directory',
		placeholder: MC_PATH,
		autocomplete: autocompleteDirectory,
	})) as string;

	// Profile directory selection
	const profilesDirectory = (await text({
		message: 'Enter profiles directory',
		placeholder: VERSIONS_PATH,
		autocomplete: autocompleteDirectory,
	})) as string;

	const settings: LauncherSettings = {
		Name: name,
		GameDirectory: gameDirectory,
		ProfilesDirectory: profilesDirectory,
	};

	// Save settings with progress indicator
	const s = spinner();
	s.start('Saving launcher settings...');
	saveIniFile(settings, SETTINGS_PATH);
	s.stop('Settings saved successfully! ✨');

	return settings;
}

/**
 * Retrieves the settings for a specific Minecraft profile, creating the profile if it does not exist.
 *
 * If the profile settings file is missing, prompts the user to create a new profile before returning the settings.
 *
 * @param settings - The launcher settings containing the profiles directory path.
 * @param profile - The name of the profile whose settings are to be retrieved.
 * @returns The parsed profile settings from the profile's settings file.
 */
export async function getProfileSettings(
	settings: LauncherSettings,
	profile: string
) {
	const profilePath = join(settings.ProfilesDirectory, profile);
	const profileSettingsPath = join(profilePath, 'profile-settings.ini');

	if (existsSync(profileSettingsPath)) {
		return readIniFile<ProfileSettings>(profileSettingsPath);
	}

	if (profileSettingsPath.includes('ModrinthApp')) {
		const modrinthProfile = await getModrinthProfile(
			settings.ProfilesDirectory,
			profile
		);
		if (modrinthProfile?.game_version) {
			await createProfileSettings(
				settings.ProfilesDirectory,
				profile,
				(modrinthProfile.mod_loader || 'fabric') as LoaderType,
				modrinthProfile.game_version,
				modrinthProfile.mod_loader_version || '',
				modrinthProfile.override_mc_memory_max || '4'
			);
		}
	}

	while (!existsSync(profileSettingsPath)) {
		await createNewProfile(settings, profile);
	}
	return readIniFile<ProfileSettings>(profileSettingsPath);
}

/**
 * Returns the first directory path that autocompletes the given partial input.
 *
 * Splits the input into a parent directory and search term, then searches for the first subdirectory whose name starts with the search term (case-insensitive). Returns the completed directory path with a trailing slash, or `undefined` if no match is found or an error occurs.
 *
 * @param input - The partial directory path to autocomplete.
 * @returns The autocompleted directory path with a trailing slash, or `undefined` if no match is found.
 */
async function autocompleteDirectory(
	input: string
): Promise<string | undefined> {
	if (!input) return;
	try {
		const pathParts = input.split(/[/\\]/);
		const directoryPath = pathParts.slice(0, -1).join('/') || '.';
		const searchTerm = pathParts.at(-1)?.toLowerCase() || '';

		const dirEntries = await readdir(directoryPath, { withFileTypes: true });
		const matchingDirectory = dirEntries.find(
			(entry) =>
				entry.isDirectory() && entry.name.toLowerCase().startsWith(searchTerm)
		);

		if (!matchingDirectory) return;
		return join(directoryPath, `${matchingDirectory.name}/`);
	} catch {
		return;
	}
}
