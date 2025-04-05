import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import {
	Authenticator,
	Client,
	type ILauncherOptions,
} from 'minecraft-launcher-core';
import { selectFromList } from './utils/select';
import { displayVersions, getVersions } from './versions';

const launcher = new Client();

const rl = createInterface({
	input: process.stdin,
	output: process.stdout,
});

async function askQuestion(query: string): Promise<string> {
	return new Promise((resolve) => rl.question(query, resolve));
}

const PROFILES_PATH = join(
	process.env.APPDATA || '',
	'ModrinthApp',
	'profiles',
);

function getProfiles(): string[] {
	try {
		// Create profiles directory if it doesn't exist
		if (!existsSync(PROFILES_PATH)) {
			mkdirSync(PROFILES_PATH, { recursive: true });
			return [];
		}

		// Read and return directory names
		return readdirSync(PROFILES_PATH, { withFileTypes: true })
			.filter((dirent) => dirent.isDirectory())
			.map((dirent) => dirent.name);
	} catch (error) {
		console.error('Error reading profiles:', error);
		return [];
	}
}

async function main(): Promise<void> {
	try {
		// Get username with default
		const defaultUsername = process.env.USERNAME || 'Player';
		const usernameInput = await askQuestion(
			`Enter username (press Enter for ${defaultUsername}): `,
		);
		const username = usernameInput.trim() || defaultUsername;

		// Get available profiles
		const profiles = getProfiles();
		let selectedProfile: string;

		if (profiles.length > 0) {
			const allOptions = [...profiles, 'Create new profile'];
			const selectedIndex = await selectFromList(allOptions, 'Select profile');

			if (selectedIndex === profiles.length) {
				selectedProfile = await askQuestion('Enter new profile name: ');
				mkdirSync(join(PROFILES_PATH, selectedProfile), { recursive: true });
			} else {
				const profile = profiles[selectedIndex];
				if (!profile) {
					throw new Error('Invalid profile selected');
				}
				selectedProfile = profile;
			}
		} else {
			selectedProfile = await askQuestion(
				'No profiles found. Enter new profile name: ',
			);
			mkdirSync(join(PROFILES_PATH, selectedProfile), { recursive: true });
		}

		// Get available versions
		const versionTypes = ['Release', 'Snapshot'];
		const versionTypeIndex = await selectFromList(
			versionTypes,
			'Select version type',
		);
		const isSnapshot = versionTypeIndex === 1;

		// Fetch and display versions
		const versions = await getVersions(isSnapshot);
		await displayVersions(versions);

		// Get version selection
		const versionChoice =
			Number.parseInt(await askQuestion('Select version number: ')) - 1;
		const selectedVersion = versions[versionChoice];

		if (!selectedVersion) {
			throw new Error('Invalid version selected');
		}

		console.log(`\nSelected version: ${selectedVersion.id}`);

		const opts: ILauncherOptions = {
			clientPackage: undefined,
			authorization: Authenticator.getAuth(username),
			root: join(process.env.APPDATA || '', '.minecraft'),
			version: {
				number: selectedVersion.id,
				type: selectedVersion.type,
				custom: 'fabric-loader-0.16.12-1.20.1',
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
