import { join, resolve } from 'node:path';
import { client } from '../constants.ts';
import { downloadToDirectory } from '../core/download.ts';
import type { ILauncherOptions, ILibrary, IVersionManifest } from '../types.ts';
import { getErrorMessage } from '../utils/other.ts';
import { parseRule } from '../utils/system.ts';

/**
 * Downloads and collects all required libraries for Minecraft
 * Handles both custom (Forge/Fabric) and vanilla Minecraft libraries
 * @returns Array of paths to downloaded library files
 */
export async function getClasses(
	options: ILauncherOptions,
	version: IVersionManifest,
	classJson?: IVersionManifest
): Promise<string[]> {
	const libraryDirectory = resolve(
		options.overrides?.libraryRoot || join(options.root, 'libraries')
	);

	try {
		const vanillaLibs = await downloadVanillaLibraries(
			classJson,
			libraryDirectory,
			version
		);

		const customLibs = await downloadCustomLibraries(
			classJson,
			libraryDirectory
		);

		client.emit('debug', 'Collected class paths');
		return [...vanillaLibs, ...customLibs];
	} catch (error) {
		client.emit('debug', `Failed to download libraries: ${error}`);
		return [];
	}
}

/**
 * Downloads a set of libraries to the specified directory with optional pre-download operations
 * @returns Array of downloaded library paths
 */
async function downloadLibraries(
	directory: string,
	libraries: ILibrary[],
	eventName: string,
	beforeDownload?: () => Promise<void>
): Promise<string[]> {
	try {
		if (beforeDownload) {
			await beforeDownload();
		}
		return await downloadToDirectory(directory, libraries, eventName);
	} catch (error) {
		client.emit(
			'debug',
			`Failed to download libraries: ${getErrorMessage(error)}`
		);
		return [];
	}
}

/**
 * Downloads custom libraries (like Forge/Fabric) and their Maven dependencies
 * @returns Array of downloaded custom library paths
 */
function downloadCustomLibraries(
	classJson: IVersionManifest | undefined,
	libraryDirectory: string
): Promise<string[]> {
	if (!classJson) return Promise.resolve([]);

	return downloadLibraries(
		libraryDirectory,
		classJson.libraries,
		'classes-custom',
		async () => {
			if (classJson.mavenFiles) {
				await downloadLibraries(
					libraryDirectory,
					classJson.mavenFiles,
					'classes-maven-custom'
				);
			}
		}
	);
}

/**
 * Downloads vanilla Minecraft libraries that are compatible with the system
 * and don't conflict with custom libraries
 * @returns Array of downloaded vanilla library paths
 */
function downloadVanillaLibraries(
	classJson: IVersionManifest | undefined,
	libraryDirectory: string,
	version: IVersionManifest
): Promise<string[]> {
	const compatibleLibs = version.libraries.filter(
		(lib) => isLibraryCompatible(lib) && isLibraryUnique(lib, classJson)
	);

	return downloadLibraries(libraryDirectory, compatibleLibs, 'classes-vanilla');
}

/**
 * Checks if a library is compatible with the current system
 * @returns true if library has artifacts and passes system rules
 */
function isLibraryCompatible(lib: ILibrary): boolean {
	return lib.downloads?.artifact !== undefined && !parseRule(lib);
}

/**
 * Checks if a library doesn't conflict with custom version libraries
 * @returns true if library name is unique across all libraries
 */
function isLibraryUnique(lib: ILibrary, classJson?: IVersionManifest): boolean {
	if (!classJson) return true;
	const libName = lib.name.split(':')[1];
	return !classJson.libraries.some((l) => l.name.split(':')[1] === libName);
}

// (async () => {
// 	client.on('debug', console.log);
// 	client.on('data', console.log);
// 	const { handleProgress } = await import('@/utils/progress.ts');
// 	client.on('progress', handleProgress);
// 	const { initializeLauncherOptions } = await import('@/client/core/launch.ts');
// 	const options = initializeLauncherOptions({
// 		root: 'out',
// 		version: { number: '1.7.5' },
// 	});
// 	const { getVersionManifest } = await import('@/client/handlers/version.ts');
// 	const version = await getVersionManifest(options);
// 	const classes = await getClasses(options, version, undefined);
// 	console.log(classes);
// })();
