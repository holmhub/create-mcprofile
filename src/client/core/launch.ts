import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getAssets } from '../handlers/assets.ts';
import { getClasses } from '../handlers/libraries.ts';
import { getNatives } from '../handlers/natives.ts';
import {
	getCustomVersionManifest,
	getJar,
	getVersionManifest,
	parseVersion,
} from '../handlers/version.ts';
import { client } from '../index.ts';
import type { ILauncherOptions } from '../types.ts';
import { getMemory } from '../utils/memory.ts';
import { getUniqueNonNullValues } from '../utils/other.ts';
import { getOS } from '../utils/system.ts';
import { getLaunchOptions } from './arguments.ts';
import { checkJava, getJVM, setupJava21, setupJava8 } from './java.ts';
import { configureLog4jForVersion } from './prepare.ts';

export function initializeLauncherOptions(
	options: ILauncherOptions
): ILauncherOptions {
	options.root = resolve(options.root);

	options.overrides = {
		detached: true,
		...options.overrides,
		url: {
			meta: 'https://launchermeta.mojang.com',
			resource: 'https://resources.download.minecraft.net',
			mavenForge: 'https://files.minecraftforge.net/maven/',
			defaultRepoForge: 'https://libraries.minecraft.net/',
			fallbackMaven: 'https://search.maven.org/remotecontent?filepath=',
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

	return options;
}

export async function init(options: ILauncherOptions) {
	initializeLauncherOptions(options);
	mkdirSync(options.root, { recursive: true });
	if (options.directory) {
		mkdirSync(options.directory, { recursive: true });
	}

	const versionFile = await getVersionManifest(options);
	const { minorVersion } = parseVersion(versionFile.id);
	const modifyJson = await getCustomVersionManifest(options);
	const nativePath = await getNatives(options, versionFile);

	options.version.type = versionFile.type;

	if (!existsSync(options.mcPath || '')) {
		client.emit('debug', 'Attempting to download Minecraft version jar');
		await getJar(options, versionFile);
	}

	const args: string[] = [];

	let jvm = [
		'-XX:-UseAdaptiveSizePolicy',
		'-XX:-OmitStackTraceInFastThrow',
		'-Dfml.ignorePatchDiscrepancies=true',
		'-Dfml.ignoreInvalidMinecraftCertificates=true',
		`-Djava.library.path=${nativePath}`,
		`-Xmx${getMemory(options)[0]}`,
		`-Xms${getMemory(options)[1]}`,
	];

	if (getOS() === 'osx') {
		if (minorVersion > 12) {
			jvm.push(getJVM());
		}
	} else {
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
		: `${separator}${join(options.directory || '', `${options.version.number}.jar`)}`;
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
	client.emit('debug', 'Checking Java installation...');
	let javaPath = options.javaPath || 'java';
	const javaVersion = await checkJava(javaPath);
	if (!javaVersion) {
		// No Java found, install appropriate version
		javaPath =
			minorVersion < 7
				? await setupJava8(options.root)
				: await setupJava21(options.root);
	} else if (javaVersion > 8 && minorVersion < 7) {
		// Java version too new for legacy MC
		client.emit(
			'debug',
			`Java ${javaVersion} not compatible with MC ${minorVersion}, installing Java 8`
		);
		javaPath = await setupJava8(options.root);
	}
	options.javaPath = javaPath;

	return startMinecraft(launchArguments, options);
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
