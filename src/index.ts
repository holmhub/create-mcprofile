import type { LauncherSettings, ProfileSettings } from '@/cli/types.ts';
import { formatInColumns } from '@/cli/utils/format.ts';
import { readIniFile, saveIniFile } from '@/cli/utils/ini.ts';
import { getAuth } from '@/client/auth.ts';
import { getVersionsManifest } from '@/client/handlers/version.ts';
import { launch } from '@/client/index.ts';
import { handleDownloadStatus, handleProgress } from '@/utils/progress.ts';
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
import { join, resolve } from 'node:path';

const USERNAME = process.env.USERNAME || 'Player';
const MC_PATH = join(process.env.APPDATA || '', '.minecraft');
const VERSIONS_PATH = join(MC_PATH, 'versions');
const SETTINGS_FILE = 'launcher-settings.ini';
const SETTINGS_PATH = resolve(
	join(process.env.USERPROFILE || '', '.mcprofile', SETTINGS_FILE)
);

main().catch((err) => {
	cancel(`An error occurred: ${err.message}`);
	process.exit(1);
});

async function main() {
	intro('🎮 Minecraft Launcher CLI');
	const settings = await getLauncherSettings();

	// Version selection
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

	// get profile settings
	const profilePath = join(settings.ProfilesDirectory, profile);
	const profileSettingsPath = join(profilePath, 'profile-settings.ini');

	while (!existsSync(profileSettingsPath)) {
		note(`Profile settings not found at ${profileSettingsPath}`);
		await createNewProfile(settings, profile);
	}

	outro(`🎮 Minecraft is ready to play! Have fun! ${profile}`);

	const profileSettings = readIniFile<ProfileSettings>(profileSettingsPath);
	const { Name, GameDirectory, ProfilesDirectory } = settings;
	const { Version, RAM } = profileSettings;
	startGame({
		name: Name,
		gameDir: GameDirectory,
		profilesDir: ProfilesDirectory,
		profile,
		version: Version,
		ram: RAM,
	});
}

async function getLauncherSettings(): Promise<LauncherSettings> {
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
	})) as string;

	// Profile directory selection
	const profilesDirectory = (await text({
		message: 'Enter profiles directory',
		placeholder: VERSIONS_PATH,
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

async function createNewProfile(
	settings: LauncherSettings,
	declaredName?: string
): Promise<string | undefined> {
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
		version = await selectMinecraftVersion(settings);
	}

	// Select mod loader type
	const loader = await select({
		message: 'Select mod loader',
		options: [
			{ value: 'vanilla', label: 'Vanilla' },
			{ value: 'fabric', label: 'Fabric' },
			{ value: 'forge', label: 'Forge' },
			{ value: 'quilt', label: 'Quilt' },
		],
	});

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
			`Version:      ${version}`,
			`Mod Loader:   ${String(loader)}`,
			`RAM:          ${ram}`,
			`Profile Name: ${profileName}`,
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

	// Save profile settings
	const profileSettings: ProfileSettings = {
		Version: version,
		Loader: loader as Exclude<typeof loader, symbol>,
		RAM: ram,
	};
	saveIniFile(profileSettings, join(profilePath, 'profile-settings.ini'));
	return profileName;
}

async function selectMinecraftVersion(
	settings: LauncherSettings
): Promise<string> {
	// Let user choose between release versions only or all versions (including snapshots)
	const versionType = await select({
		message: 'Select version type',
		options: [
			{ value: 'release', label: 'Release' },
			{ value: 'all', label: 'All (including snapshots)' },
		],
	});

	const manifest = await getVersionsManifest({
		root: settings.GameDirectory,
		version: { number: '' },
	});
	const filteredVersions = manifest.versions
		.filter((version) => versionType === 'all' || version.type === 'release')
		.map((version) => version.id);

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
		validate(value) {
			if (!value) return 'Version number is required';
			if (!filteredVersions.includes(value))
				return 'Version not found in manifest';
		},
	})) as string;

	return version;
}

async function selectRAMAllocation(): Promise<string> {
	let ram = (await select({
		message: 'Select RAM allocation',
		options: [
			{ value: '2G', label: '2GB (Vanilla/Light Modpacks)' },
			{ value: '4G', label: '4GB (Medium Modpacks)' },
			{ value: '6G', label: '6GB (Heavy Modpacks)' },
			{ value: '8G', label: '8GB (Expert Modpacks)' },
			{ value: 'custom', label: 'Custom Amount' },
		],
	})) as string;

	if (ram === 'custom') {
		ram = (await text({
			message: 'Enter RAM amount (in GB)',
			placeholder: '4',
			validate(value) {
				const num = Number.parseInt(value);
				if (Number.isNaN(num)) return 'Please enter a valid number';
				if (num < 1) return 'Minimum 1GB required';
				if (num > 32) return 'Maximum 32GB allowed';
				return;
			},
		})) as string;
		ram = `${ram}G`;
	}

	return ram as string;
}

function startGame({
	name,
	gameDir,
	profilesDir,
	version,
	profile,
	ram,
}: {
	name: string;
	gameDir: string;
	profilesDir: string;
	version: string;
	profile: string;
	ram: string;
}) {
	console.log({
		name,
		gameDir,
		profilesDir,
		version,
		profile,
		ram,
	});
	const maxRam = Number.parseInt(ram);
	const minRam = Math.floor(maxRam / 2);
	const launcher = launch({
		authorization: getAuth(name),
		root: gameDir,
		version: {
			number: version,
			custom: profile,
		},
		memory: {
			max: `${maxRam}G`,
			min: `${minRam}G`,
		},
		overrides: {
			maxSockets: 4,
			gameDirectory: join(profilesDir, profile),
		},
	});

	launcher.on('debug', console.log);
	launcher.on('data', console.log);
	launcher.on('progress', handleProgress);
	const allowedSet = new Set(['java-download']);
	launcher.on('download-status', (event) => {
		allowedSet.has(event.type) && handleDownloadStatus(event);
	});
}
