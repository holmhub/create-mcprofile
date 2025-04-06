import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import {
	Authenticator,
	Client,
	type ILauncherOptions,
} from 'minecraft-launcher-core';
import { getFromInput } from './utils/input';
import { selectFromList } from './utils/select';
import { selectVersion } from './utils/versions';

const launcher = new Client();

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
	try {
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

		const opts: ILauncherOptions = {
			clientPackage: undefined,
			authorization: Authenticator.getAuth(username),
			root: MC_PATH,
			version: {
				number: selectedVersion.id,
				type: selectedVersion.type,
				...(selectedModLoader && { custom: selectedModLoader }),
			},
			memory: {
				max: '4G',
				min: '2G',
			},
			overrides: {
				maxSockets: 4,
				gameDirectory: join(PROFILES_PATH, selectedProfile),
			},
		};

		console.log('Launching Minecraft...');
		launcher.launch({
			...opts,
			clientPackage: undefined,
		});

		launcher.on('debug', console.log);
		launcher.on('data', console.log);
		launcher.on(
			'progress',
			(e: { type: string; task: string; total: number }) => {
				console.log(`Download progress: ${e.type} | ${e.task} | ${e.total}`);
			},
		);
	} catch (error) {
		console.error('Error launching Minecraft:', error);
	}
}

main().finally(() => rl.close());
