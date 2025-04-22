import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DEFAULT_URLS, client } from '../constants.ts';
import { getAssets } from '../handlers/assets.ts';
import { getClasses } from '../handlers/libraries.ts';
import { getNatives } from '../handlers/natives.ts';
import {
	getCustomVersionManifest,
	getJar,
	getVersionManifest,
	parseVersion,
} from '../handlers/version.ts';
import { isModernForge } from '../loaders/forgeWrapper.ts';
import type { ILauncherOptions } from '../types.ts';
import { getMemory } from '../utils/memory.ts';
import { getUniqueNonNullValues } from '../utils/other.ts';
import { getOS } from '../utils/system.ts';
import { getLaunchOptions } from './arguments.ts';
import { getJVM, selectJavaPath } from './java.ts';
import { configureLog4jForVersion } from './prepare.ts';
import { chmod } from 'node:fs/promises';
import { homedir } from 'node:os';

const launcherName = 'launch-minecraft';

export async function init(options: ILauncherOptions) {
	initializeLauncherOptions(options);

	// Handle root directory and version directory
	if (!options.directory) throw new Error('No version specified');
	mkdirSync(options.root, { recursive: true });
	mkdirSync(options.directory, { recursive: true });

	const versionFile = await getVersionManifest(options);
	const { minorVersion } = parseVersion(versionFile.id);
	const modifyJson = await getCustomVersionManifest(options);
	const nativePath = await getNatives(options, versionFile);
	options.version.type = versionFile.type;

	if (options.forge && modifyJson && isModernForge(modifyJson)) {
		addForgeWrapperArguments(options);
		options.forge = undefined;
	}

	client.emit('debug', 'Attempting to download Minecraft version jar');
	await getJar(options, versionFile);

	const args: string[] = [];
	const [Xmx, Xms] = getMemory(options);

	let jvm = [
		'-XX:-UseAdaptiveSizePolicy',
		'-XX:-OmitStackTraceInFastThrow',
		'-Dfml.ignorePatchDiscrepancies=true',
		'-Dfml.ignoreInvalidMinecraftCertificates=true',
		`-Djava.library.path=${nativePath}`,
		`-Xmx${Xmx}`,
		`-Xms${Xms}`,
	];

	// Add OS-specific JVM options (skip for macOS with MC versions <= 1.12)
	if (getOS() !== 'osx' || minorVersion > 12) {
		jvm.push(getJVM());
	}

	if (options.customArgs) jvm = jvm.concat(options.customArgs);

	// https://help.minecraft.net/hc/en-us/articles/4416199399693-Security-Vulnerability-in-Minecraft-Java-Edition
	if (minorVersion === 18 || minorVersion === 17) {
		jvm.push('-Dlog4j2.formatMsgNoLookups=true');
	}

	// Handle log4j configuration
	if (options.overrides?.logj4ConfigurationFile) {
		jvm.push(
			`-Dlog4j.configurationFile=${resolve(options.overrides.logj4ConfigurationFile)}`
		);
	} else {
		const log4jUrls = {
			modern:
				'https://launcher.mojang.com/v1/objects/02937d122c86ce73319ef9975b58896fc1b491d1/log4j2_112-116.xml',
			legacy:
				'https://launcher.mojang.com/v1/objects/dd2b723346a8dcd48e7f4d245f6bf09e98db9696/log4j2_17-111.xml',
		};
		const url =
			minorVersion >= 7 && minorVersion < 12
				? log4jUrls.legacy
				: log4jUrls.modern;
		await configureLog4jForVersion(options, jvm, url);
	}

	const classes =
		options.overrides?.classes ||
		getUniqueNonNullValues(await getClasses(options, versionFile, modifyJson));

	const classPaths = ['-cp'];
	const separator = getOS() === 'windows' ? ';' : ':';
	// Handling launch arguments.
	const file = modifyJson || versionFile;
	// So mods like fabric work.
	const jar = existsSync(options.mcPath || '')
		? `${separator}${options.mcPath}`
		: `${separator}${join(options.directory, `${options.version.number}.jar`)}`;
	classPaths.push(
		`${options.forge ? options.forge + separator : ''}${classes.join(separator)}${jar}`
	);
	classPaths.push(file.mainClass);

	client.emit('debug', 'Attempting to download assets');
	await getAssets(options, versionFile);

	// Forge -> Custom -> Vanilla
	const launchOptions = await getLaunchOptions(
		options,
		versionFile,
		modifyJson
	);

	const stringArgs = launchOptions.map((arg) =>
		typeof arg === 'string' ? arg : String(arg)
	);

	// Handle launch arguments differently for legacy versions
	const launchArguments =
		minorVersion < 6
			? args.concat(
					jvm,
					classPaths,
					['net.minecraft.client.Minecraft'],
					stringArgs
				)
			: args.concat(jvm, classPaths, stringArgs);

	client.emit('arguments', launchArguments);

	// Handle Java path selection
	options.javaPath = await selectJavaPath(options);

	createLaunchScripts(launchArguments, options);

	return startMinecraft(launchArguments, options);
}

/**
 * Normalizes and augments launcher options for Minecraft startup.
 *
 * Resolves and sets absolute paths for the root directory, working directory, and Minecraft jar file. Merges default and custom URL overrides. If Forge is specified, appends Forge wrapper JVM arguments to any existing custom arguments.
 *
 * @param options - The launcher options to initialize and normalize.
 * @returns The updated launcher options with resolved paths and merged overrides.
 */
function initializeLauncherOptions(
	options: ILauncherOptions
): ILauncherOptions {
	options.root = resolve(options.root);

	options.overrides = {
		detached: true,
		...options.overrides,
		url: {
			...DEFAULT_URLS,
			...(options.overrides?.url || undefined),
		},
	};

	options.directory = resolve(
		options.overrides.directory ||
			join(
				options.root,
				'versions',
				options.version.custom || options.version.number
			)
	);

	options.mcPath =
		options.overrides.minecraftJar ||
		join(
			options.directory,
			`${options.version.custom || options.version.number}.jar`
		);

	if (options.forge) {
	}

	return options;
}

function addForgeWrapperArguments(options: ILauncherOptions) {
	const forgeWrapperAgrs = [
		`-Dforgewrapper.librariesDir=${resolve(options.overrides?.libraryRoot || join(options.root, 'libraries'))}`,
		`-Dforgewrapper.installer=${options.forge}`,
		`-Dforgewrapper.minecraft=${options.mcPath}`,
	];

	options.customArgs = options.customArgs
		? options.customArgs.concat(forgeWrapperAgrs)
		: forgeWrapperAgrs;
}

function createLaunchScripts(
	launchArguments: string[],
	options: ILauncherOptions
) {
	const scriptDir = resolve(options.overrides?.gameDirectory || options.root);
	mkdirSync(scriptDir, { recursive: true });

	const javaw = `${options.javaPath || 'java'}w`;

	// Create .bat file for Windows
	const batContent = `@echo off\r\n"${javaw}" ${launchArguments.join(' ')}`;
	const batPath = join(scriptDir, `${launcherName}.bat`);
	writeFileSync(batPath, batContent, 'utf-8');

	// Create .sh file for Unix-like systems
	const shContent = `#!/bin/sh\n"${javaw}" ${launchArguments.join(' ')}`;
	const shPath = join(scriptDir, `${launcherName}.sh`);
	writeFileSync(shPath, shContent, 'utf-8');

	// Make .sh executable on Unix-like systems
	if (getOS() !== 'windows') {
		chmod(shPath, '755');
	}

	client.emit(
		'debug',
		`Launch scripts created at: ${resolve(options.overrides?.gameDirectory || options.root)}`
	);

	return { batPath, shPath };
}

export function createShortcut(
	gameDirectory: string,
	profileName: string,
	icon?: string
) {
	const shortcutDir = join(gameDirectory, profileName);
	const shortcutPath = join(homedir(), 'Desktop', `${profileName}.lnk`);
	const iconPath = icon || join(shortcutDir, 'icon.ico');
	console.log(iconPath);

	const batPath = join(shortcutDir, `${launcherName}.bat`);

	const vbsContent = `
Set WshShell = WScript.CreateObject("WScript.Shell")
Set shortcut = WshShell.CreateShortcut("${shortcutPath}")
shortcut.TargetPath = "${batPath}"
shortcut.WorkingDirectory = "${shortcutDir}"
shortcut.IconLocation = "${iconPath}"
shortcut.Save
`;
	const vbsPath = join(shortcutDir, 'create_shortcut.vbs');
	writeFileSync(vbsPath, vbsContent, 'utf-8');
	spawn('wscript', [vbsPath], { stdio: 'ignore', detached: true }).on(
		'close',
		() => unlinkSync(vbsPath)
	);
}

function startMinecraft(launchArguments: string[], options: ILauncherOptions) {
	client.emit('debug', '🚀 Launching Minecraft...');

	const minecraft = spawn(
		options.javaPath ? options.javaPath : 'java',
		launchArguments,
		{
			cwd: options.overrides?.cwd || options.root,
			detached: options.overrides?.detached,
		}
	);
	minecraft.stdout.on('data', (data) =>
		client.emit('data', data.toString('utf-8'))
	);
	minecraft.stderr.on('data', (data) =>
		client.emit('data', data.toString('utf-8'))
	);
	minecraft.on('close', (code) => client.emit('close', code));
	return minecraft;
}
