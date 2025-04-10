import { selectProfile } from '@/cli/profiles.ts';
import { getLauncherSettings, getProfileSettings } from '@/cli/settings.ts';
import { getAuth } from '@/client/auth.ts';
import { launch } from '@/client/index.ts';
import { handleDownloadStatus, handleProgress } from '@/utils/progress.ts';
import { cancel, intro, outro } from '@clack/prompts';
import { join } from 'node:path';

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
			custom: loaderManifest,
		},
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
	const allowedSet = new Set(['java-download']);
	launcher.on('download-status', (event) => {
		allowedSet.has(event.type) && handleDownloadStatus(event);
	});
}
