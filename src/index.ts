import { join, resolve } from 'node:path';
import { selectProfile } from '@/cli/profiles.ts';
import { getLauncherSettings, getProfileSettings } from '@/cli/settings.ts';
import {
	handleDownloadStatus,
	handleExtractStatus,
	handleProgress,
} from '@/cli/utils/progress.ts';
import { getAuth } from '@/client/auth.ts';
import { launch } from '@/client/client.ts';
import { cancel, intro, outro } from '@clack/prompts';

main().catch((err) => {
	cancel(`An error occurred: ${err.message}`);
	process.exit(1);
});

async function main() {
	intro('🎮 Minecraft Launcher CLI');

	const settings = await getLauncherSettings();
	const profile = await selectProfile(settings);
	const profileSettings = await getProfileSettings(settings, profile);

	outro(`🎮 Minecraft is ready to play! Have fun! ${profile}`);

	const { Name, GameDirectory, ProfilesDirectory } = settings;
	const { Version, LoaderManifest, RAM } = profileSettings;
	startGame({
		name: Name,
		gameDir: GameDirectory,
		profilesDir: ProfilesDirectory,
		profile,
		loaderManifest: LoaderManifest,
		version: Version,
		ram: RAM,
	});
}

/**
 * Launches Minecraft with the specified profile, version, and memory settings.
 *
 * If a Forge loader manifest is provided and starts with "forge", the function configures the launcher to use the corresponding Forge installer JAR from the profile directory.
 *
 * @param name - The launcher or user profile name.
 * @param gameDir - The root directory for the Minecraft installation.
 * @param profilesDir - The directory containing user profiles.
 * @param version - The Minecraft version to launch.
 * @param loaderManifest - Optional loader manifest identifier (e.g., Forge version).
 * @param profile - The selected profile name.
 * @param ram - The maximum RAM allocation for the game, in gigabytes.
 *
 * @remark
 * Sets up event listeners to handle debug, data, progress, extraction, and download status updates during the launch process.
 */
function startGame({
	name,
	gameDir,
	profilesDir,
	version,
	loaderManifest,
	profile,
	ram,
}: {
	name: string;
	gameDir: string;
	profilesDir: string;
	version: string;
	loaderManifest?: string;
	profile: string;
	ram: string;
}) {
	const maxRam = Number.parseInt(ram);
	const minRam = Math.floor(maxRam / 2);
	const launcher = launch({
		authorization: getAuth(name),
		root: gameDir,
		version: {
			number: version,
			custom: loaderManifest,
		},
		...(loaderManifest?.startsWith('forge')
			? {
					forge: resolve(
						join(profilesDir, profile, `${loaderManifest}-installer.jar`)
					),
				}
			: {}),
		memory: {
			max: `${maxRam}G`,
			min: `${minRam}G`,
		},
		overrides: {
			maxSockets: 4,
			gameDirectory: join(profilesDir, profile),
			directory: join(profilesDir, profile),
		},
	});

	launcher.on('debug', console.log);
	launcher.on('data', console.log);
	launcher.on('progress', handleProgress);

	const extractStatusSet = new Set(['java-extract']);
	launcher.on('extract-status', (event) => {
		extractStatusSet.has(event.type) && handleExtractStatus(event);
	});

	const downloadStatusSet = new Set(['java-download', 'version-jar']);
	launcher.on('download-status', (event) => {
		downloadStatusSet.has(event.type) && handleDownloadStatus(event);
	});
}
