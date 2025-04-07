import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { downloadAsync } from '../core/download.ts';
import { client } from '../index.ts';
import type {
	IArtifact,
	ILauncherOptions,
	IVersionManifest,
} from '../types.ts';
import { unzipFile } from '../utils/compressor.ts';
import { getOS, parseRule } from '../utils/system.ts';
import { parseVersion } from './version.ts';

/**
 * Downloads and extracts native libraries for Minecraft
 * @returns Path to the natives directory or root directory for newer versions
 */
export async function getNatives(
	options: ILauncherOptions,
	version: IVersionManifest
): Promise<string> {
	const nativeDirectory = resolve(
		options.overrides?.natives || join(options.root, 'natives', version.id)
	);

	// Skip natives extraction for Minecraft 1.19+ as they're bundled with the game
	if (parseVersion(version.id).minorVersion >= 19) {
		return options.overrides?.cwd || options.root;
	}

	// Return existing natives if already extracted
	if (existsSync(nativeDirectory) && readdirSync(nativeDirectory).length > 0) {
		return nativeDirectory;
	}

	const natives = collectNatives(version.libraries);
	client.emit('progress', { type: 'natives', task: 0, total: natives.length });

	mkdirSync(nativeDirectory, { recursive: true });
	await processNatives(natives, nativeDirectory);
	client.emit('debug', 'Downloaded and extracted natives');

	return nativeDirectory;
}

function collectNatives(libraries: IVersionManifest['libraries']): IArtifact[] {
	const OS = getOS();
	// Use Map to deduplicate natives by URL
	const natives = new Map<string, IArtifact>();

	for (const lib of libraries) {
		// Skip libraries without natives or those not matching current OS rules
		if (!lib.downloads?.classifiers || parseRule(lib)) continue;

		const native = getNativeClassifier(lib.downloads.classifiers, OS);
		if (native) natives.set(native.url, native);
	}

	return [...natives.values()];
}

async function processNatives(
	natives: IArtifact[],
	nativeDirectory: string
): Promise<void> {
	let task = 0;
	await Promise.all(
		natives.map(async (native) => {
			await processNative(native, nativeDirectory);

			client.emit('progress', {
				type: 'natives',
				task: ++task,
				total: natives.length,
			});
		})
	);
}

function getNativeClassifier(
	classifiers: Record<string, IArtifact>,
	os: string
): IArtifact | undefined {
	if (os === 'osx') {
		return classifiers['natives-osx'] || classifiers['natives-macos'];
	}
	return classifiers[`natives-${os}`];
}

async function processNative(
	native: IArtifact,
	nativeDirectory: string
): Promise<void> {
	const name = native.path.split('/').pop() as string;
	const nativePath = join(nativeDirectory, name);

	try {
		await downloadAsync(native.url, nativeDirectory, name, true, 'natives');
		await unzipFile(nativePath, nativeDirectory);
		unlinkSync(nativePath);
	} catch (error) {
		client.emit('debug', `Failed to process native ${name}: ${error}`);
		throw error;
	}
}
