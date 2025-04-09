import {
	cancel,
	intro,
	note,
	outro,
	select,
	spinner,
	text,
} from '@clack/prompts';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { LauncherSettings } from './types.ts';
import { readIniFile, saveIniFile } from './utils/ini.ts';
import { getVersionsManifest } from '@/client/handlers/version.ts';
import { formatInColumns } from './utils/format.ts';

const USERNAME = process.env.USERNAME || 'Player';
const MC_PATH = join(process.env.APPDATA || '', '.minecraft');
const VERSIONS_PATH = join(MC_PATH, 'versions');
const SETTINGS_FILE = 'launcher-settings.ini';
const SETTINGS_PATH = join('out', SETTINGS_FILE);

async function main() {
	intro('🎮 Minecraft Launcher CLI');

	let settings: LauncherSettings = {
		Name: '',
		GameDirectory: '',
		ProfilesDirectory: '',
	};
	const isSettingsExist = existsSync(SETTINGS_PATH);

	// Check if settings file exists and load it
	if (isSettingsExist) {
		const s = spinner();
		s.start('Loading existing settings...');
		settings = readIniFile<LauncherSettings>(SETTINGS_PATH);
		s.stop(`Settings loaded from ${SETTINGS_PATH}`);
	}

	// Username input
	if (!settings.Name) {
		settings.Name = (await text({
			message: 'Enter your Name',
			placeholder: USERNAME,
			validate(value) {
				if (value.length < 3) return 'Username must be at least 3 characters.';
				if (value.length > 16)
					return 'Username must be less than 16 characters.';
				if (!/^[a-zA-Z0-9_]+$/.test(value))
					return 'Username can only contain letters, numbers, and underscores.';
			},
		})) as string;
	}

	// Game directory input
	if (!settings.GameDirectory) {
		settings.GameDirectory = (await text({
			message: 'Enter game directory',
			placeholder: MC_PATH,
		})) as string;
	}

	// Profile directory selection
	if (!settings.ProfilesDirectory) {
		settings.ProfilesDirectory = (await text({
			message: 'Enter profiles directory',
			placeholder: VERSIONS_PATH,
		})) as string;
	}

	// Save settings with progress indicator
	if (!existsSync(SETTINGS_PATH)) {
		const s = spinner();
		s.start('Saving launcher settings...');
		saveIniFile(settings, SETTINGS_PATH);
		s.stop('Settings saved successfully! ✨');
	}

	// Version selection
	mkdirSync(settings.ProfilesDirectory, { recursive: true });
	const createOption = { value: 'create', label: 'Create new profile 🌟' };
	const existingProfiles = readdirSync(settings.ProfilesDirectory, {
		withFileTypes: true,
	})
		.filter((dirent) => dirent.isDirectory())
		.map(({ name }) => ({ value: name, label: name }));
	const profile = await select<string>({
		message: 'Select Minecraft version',
		options: [...existingProfiles, createOption],
	});

	if (profile === 'create') {
		const version = await select<string>({
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
		});

		if (version === 'other') {
			const manifest = await getVersionsManifest({
				root: settings.GameDirectory,
				version: { number: '' },
			});

			const versionType = await select({
				message: 'Select version type',
				options: [
					{ value: 'release', label: 'Release' },
					{ value: 'all', label: 'All (including snapshots)' },
				],
			});

			const filteredVersions = manifest.versions
				.filter(
					(version) => versionType === 'all' || version.type === 'release'
				)
				.map((version) => version.id);
			note(
				formatInColumns(filteredVersions, {
					columns: versionType === 'all' ? 5 : 8,
					header: `📦 Available ${versionType === 'all' ? 'All' : 'Release'} Versions:`,
					padding: versionType === 'all' ? 15 : 10,
				})
			);

			const version = await text({
				message: 'Enter version number',
				placeholder: '1.20.1',
				validate(value) {
					if (!value) return 'Version number is required';
					if (!filteredVersions.includes(value))
						return 'Version not found in manifest';
				},
			});

			if (!version) {
				cancel('Version number is required');
				process.exit(1);
			}

			// TODO: Install version
		}
	}

	outro('🎮 Minecraft is ready to play! Have fun!');
}

main().catch((err) => {
	cancel(`An error occurred: ${err.message}`);
	process.exit(1);
});
