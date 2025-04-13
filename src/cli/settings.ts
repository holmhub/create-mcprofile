import { note, spinner, text } from '@clack/prompts';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createNewProfile } from './profiles.ts';
import type { LauncherSettings, ProfileSettings } from './types.ts';
import { readIniFile, saveIniFile } from './utils/ini.ts';
import { readdir } from 'node:fs/promises';

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

export async function getProfileSettings(
	settings: LauncherSettings,
	profile: string
) {
	const profilePath = join(settings.ProfilesDirectory, profile);
	const profileSettingsPath = join(profilePath, 'profile-settings.ini');
	while (!existsSync(profileSettingsPath)) {
		note(`Profile settings not found at ${profileSettingsPath}`);
		await createNewProfile(settings, profile);
	}
	return readIniFile<ProfileSettings>(profileSettingsPath);
}

async function autocompleteDirectory(input: string): Promise<string[]> {
	if (!input) return [];
	try {
		const parts = input.split(/[/\\]/);
		const searchDir = parts.slice(0, -1).join('/') || '.';
		const searchTerm = parts.at(-1)?.toLowerCase() || '';

		return (await readdir(searchDir, { withFileTypes: true }))
			.filter(
				(entry) =>
					entry.isDirectory() && entry.name.toLowerCase().startsWith(searchTerm)
			)
			.map((entry) => join(searchDir, `${entry.name}/`));
	} catch {
		return [];
	}
}
