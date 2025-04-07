import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { launch } from './client';
import { getAuth } from './client/auth';
import { getFromInput } from './utils/input';
import { handleProgress } from './utils/progress';
import { selectFromList } from './utils/select';
import { selectVersion } from './utils/versions';

const rl = createInterface({
	input: process.stdin,
	output: process.stdout,
});

const MC_PATH = join(process.env.APPDATA || '', '.minecraft');
const PROFILES_PATH = join(
	process.env.APPDATA || '',
	'ModrinthApp',
	'profiles',
);

function getFolders(folder: string): string[] {
	try {
		// Create profiles directory if it doesn't exist
		if (!existsSync(folder)) {
			mkdirSync(folder, { recursive: true });
			return [];
		}

		// Read and return directory names
		return readdirSync(folder, { withFileTypes: true })
			.filter((dirent) => dirent.isDirectory())
			.map((dirent) => dirent.name);
	} catch (error) {
		console.error('Error reading folder:', error);
		return [];
	}
}

async function main(): Promise<void> {
	// Get username with default
	const defaultUsername = process.env.USERNAME || 'Player';
	const usernameInput = await getFromInput(
		`Enter username (press Enter for ${defaultUsername}): `,
		rl,
	);
	const username = usernameInput.trim() || defaultUsername;

	// Get available profiles
	const profiles = getFolders(PROFILES_PATH);
	let selectedProfile: string;
	let profileConfig: {
		version: { id?: string; type?: string; modLoader?: string };
		memory: { max: string; min: string };
	} = { version: {}, memory: { max: '4G', min: '2G' } };

	if (profiles.length > 0) {
		const allOptions = [...profiles, 'Create new profile'];
		const selectedIndex = await selectFromList(allOptions, 'Select profile');

		if (selectedIndex === profiles.length) {
			selectedProfile = await getFromInput('Enter new profile name: ', rl);
			mkdirSync(join(PROFILES_PATH, selectedProfile), { recursive: true });
		} else {
			const profile = profiles[selectedIndex];
			if (!profile) {
				throw new Error('Invalid profile selected');
			}
			selectedProfile = profile;
		}
	} else {
		selectedProfile = await getFromInput(
			'No profiles found. Enter new profile name: ',
			rl,
		);
		mkdirSync(join(PROFILES_PATH, selectedProfile), { recursive: true });
	}

	const configPath = join(
		PROFILES_PATH,
		selectedProfile,
		`${selectedProfile}.json`,
	);
	if (existsSync(configPath)) {
		profileConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
		console.log(`Loaded configuration for profile: ${selectedProfile}`);
	} else {
		// Get available mod loaders
		const modLoaders = getFolders(join(MC_PATH, 'versions'));
		let selectedModLoader: string | undefined;

		if (modLoaders.length > 0) {
			const allOptions = [...modLoaders, 'Vanilla'];
			const selectedIndex = await selectFromList(
				allOptions,
				'Select mod loader',
			);

			if (selectedIndex !== modLoaders.length) {
				const modLoader = modLoaders[selectedIndex];
				if (!modLoader) {
					throw new Error('Invalid modloader selected');
				}
				selectedModLoader = modLoader;
			}
		}

		// Get available versions
		const versionTypes = ['Release', 'Snapshot'];
		const versionTypeIndex = await selectFromList(
			versionTypes,
			'Select version type',
		);
		const isSnapshot = versionTypeIndex === 1;

		// Get version selection
		const selectedVersion = await selectVersion(
			isSnapshot,
			'Select version',
			rl,
		);

		profileConfig.version.id = selectedVersion.id;
		profileConfig.version.type = selectedVersion.type;
		profileConfig.version.modLoader = selectedModLoader;

		// Save profile configuration
		writeFileSync(
			join(PROFILES_PATH, selectedProfile, `${selectedProfile}.json`),
			JSON.stringify(profileConfig, null, 2),
		);
	}

	const launcher = launch({
		authorization: getAuth(username),
		root: MC_PATH,
		version: {
			number: profileConfig.version.id as string,
			type: profileConfig.version.type as string,
			...(profileConfig.version.modLoader && {
				custom: profileConfig.version.modLoader,
			}),
		},
		memory: {
			max: '4G',
			min: '2G',
		},
		overrides: {
			maxSockets: 4,
			gameDirectory: join(PROFILES_PATH, selectedProfile),
		},
	});

	launcher.on('debug', console.log);
	launcher.on('data', console.log);
	launcher.on('progress', handleProgress);
}

main().finally(() => rl.close());
