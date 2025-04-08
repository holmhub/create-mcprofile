import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getAssets, isLegacy } from '../handlers/assets.ts';
import { getClasses } from '../handlers/libraries.ts';
import { getNatives } from '../handlers/natives.ts';
import {
	getCustomVersionManifest,
	getJar,
	getVersionManifest,
	parseVersion,
} from '../handlers/version.ts';
import { client } from '../index.ts';
import type { ILauncherOptions, IVersionManifest } from '../types.ts';
import { getMemory } from '../utils/memory.ts';
import { getUniqueNonNullValues } from '../utils/other.ts';
import { getOS } from '../utils/system.ts';
import { downloadAndExtractPackage, downloadAsync } from './download.ts';
import { checkJava, getJVM, setupJava8 } from './java.ts';

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
		(options.version.custom
			? join(
					options.root,
					'versions',
					options.version.custom,
					`${options.version.custom}.jar`
				)
			: join(options.directory, `${options.version.number}.jar`));

	return options;
}

export async function init(options: ILauncherOptions) {
	initializeLauncherOptions(options);
	mkdirSync(options.root, { recursive: true });
	if (options.directory) {
		mkdirSync(options.directory, { recursive: true });
	}
	extractPackage(options);

	const versionFile = await getVersionManifest(options);
	const { minorVersion } = parseVersion(versionFile.id);

	// Handle Java path for legacy versions
	let javaPath = options.javaPath || 'java';
	if (minorVersion < 7) {
		client.emit('debug', 'Legacy version detected, setting up Java 8...');
		javaPath = await setupJava8(options.root);
		options.javaPath = javaPath;
	}

	await checkJava(javaPath);
	const modifyJson = await getCustomVersionManifest(options);
	const nativePath = await getNatives(options, versionFile);

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
	if (options.overrides?.logj4ConfigurationFile) {
		jvm.push(
			`-Dlog4j.configurationFile=${resolve(options.overrides.logj4ConfigurationFile)}`
		);
	}

	// https://help.minecraft.net/hc/en-us/articles/4416199399693-Security-Vulnerability-in-Minecraft-Java-Edition
	if (minorVersion === 18 || minorVersion === 17) {
		jvm.push('-Dlog4j2.formatMsgNoLookups=true');
	}

	// Handle log4j configuration for different versions
	if (!jvm.find((arg) => arg.includes('Dlog4j.configurationFile'))) {
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

	return startMinecraft(launchArguments, options);
}

function startMinecraft(launchArguments: string[], options: ILauncherOptions) {
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

async function getLaunchOptions(
	options: ILauncherOptions,
	version: IVersionManifest,
	modification?: IVersionManifest
) {
	const type = Object.assign({}, version, modification);

	let args = type.minecraftArguments
		? type.minecraftArguments.split(' ')
		: type.arguments.game;
	const assetRoot = resolve(
		options.overrides?.assetRoot || join(options.root, 'assets')
	);
	const assetPath = isLegacy(version)
		? join(options.root, 'resources')
		: join(assetRoot);

	const minArgs = options.overrides?.minArgs || isLegacy(version) ? 5 : 11;
	if (args.length < minArgs)
		args = args.concat(
			version.minecraftArguments
				? version.minecraftArguments.split(' ')
				: version.arguments.game
		);
	if (options.customLaunchArgs) args = args.concat(options.customLaunchArgs);

	// options.authorization = await Promise.resolve(options.authorization);
	if (!options.authorization) {
		throw new Error(
			'No authorization provided. Please provide an authorization object.'
		);
	}
	options.authorization.meta = options.authorization.meta
		? options.authorization.meta
		: { type: 'mojang' };
	const fields = {
		'${auth_access_token}': options.authorization.access_token,
		'${auth_session}': options.authorization.access_token,
		'${auth_player_name}': options.authorization.name,
		'${auth_uuid}': options.authorization.uuid,
		'${auth_xuid}':
			options.authorization.meta.xuid || options.authorization.access_token,
		'${user_properties}': options.authorization.user_properties,
		'${user_type}': options.authorization.meta.type,
		'${version_name}': options.version.number || options.overrides?.versionName,
		'${assets_index_name}':
			options.overrides?.assetIndex ||
			options.version.custom ||
			options.version.number,
		'${game_directory}': options.overrides?.gameDirectory || options.root,
		'${assets_root}': assetPath,
		'${game_assets}': assetPath,
		'${version_type}': options.version.type,
		'${clientid}':
			options.authorization.meta.clientId ||
			options.authorization.client_token ||
			options.authorization.access_token,
		'${resolution_width}': options.window ? options.window.width : 856,
		'${resolution_height}': options.window ? options.window.height : 482,
	};

	if (
		options.authorization.meta.demo &&
		(options.features ? !options.features.includes('is_demo_user') : true)
	) {
		args.push('--demo');
	}

	const replaceArg = (
		obj: {
			value: string | string[];
		},
		index: number
	) => {
		if (Array.isArray(obj.value)) {
			for (const arg of obj.value) {
				args.push(arg);
			}
		} else {
			args.push(obj.value);
		}
		delete args[index];
	};

	for (let index = 0; index < args.length; index++) {
		const arg = args[index];

		if (typeof arg === 'object' && arg !== null) {
			// Handle argument objects with rules
			if ('rules' in arg && Array.isArray(arg.rules)) {
				if (options.features?.length === 0) continue;

				const requiredFeatures = arg.rules.flatMap((rule) =>
					rule.features ? Object.keys(rule.features) : []
				);

				const hasAllRequiredFeatures = options.features?.every((feature) =>
					requiredFeatures.includes(feature)
				);

				if (hasAllRequiredFeatures) {
					replaceArg(arg, index);
				}
			} else {
				// Handle simple argument objects
				replaceArg(arg, index);
			}
		} else if (typeof arg === 'string' && arg in fields) {
			args[index] = fields[arg as keyof typeof fields] as string;
		}
	}
	if (options.window) {
		if (options.window.fullscreen) {
			args.push('--fullscreen');
		} else {
			if (options.window.width)
				args.push('--width', String(options.window.width));
			if (options.window.height)
				args.push('--height', String(options.window.height));
		}
	}
	if (options.server)
		client.emit(
			'debug',
			'server and port are deprecated launch flags. Use the quickPlay field.'
		);
	if (options.quickPlay) {
		const quickPlayArgs = formatQuickPlay(options);
		if (quickPlayArgs) {
			args = args.concat(quickPlayArgs);
		}
	}
	if (options.proxy) {
		args.push(
			'--proxyHost',
			options.proxy.host,
			'--proxyPort',
			options.proxy.port || '8080',
			'--proxyUser',
			options.proxy.username || '',
			'--proxyPass',
			options.proxy.password || ''
		);
	}
	args = args.filter(
		(value) => typeof value === 'string' || typeof value === 'number'
	);
	client.emit('debug', '🚀 Launching Minecraft...');
	return args;
}

function formatQuickPlay(options: ILauncherOptions): string[] | undefined {
	if (!options.quickPlay) return;

	const types = {
		singleplayer: '--quickPlaySingleplayer',
		multiplayer: '--quickPlayMultiplayer',
		realms: '--quickPlayRealms',
		legacy: null,
	} as const;

	const { type, identifier, path } = options.quickPlay;
	const keys = Object.keys(types);

	if (!keys.includes(type)) {
		client.emit(
			'debug',
			`quickPlay type is not valid. Valid types are: ${keys.join(', ')}`
		);
		return;
	}

	const isLegacyServer = type === 'legacy';
	const [serverHost = '', serverPort = '25565'] = isLegacyServer
		? identifier.split(':')
		: ['', ''];
	const quickPlayType = isLegacyServer ? '' : types[type] || '';

	const returnArgs: string[] = isLegacyServer
		? ['--server', serverHost, '--port', serverPort]
		: [quickPlayType, identifier].filter(
				(arg): arg is string => arg !== '' && arg !== null
			);

	if (path) {
		returnArgs.push('--quickPlayPath', path);
	}

	return returnArgs;
}

async function extractPackage(options: ILauncherOptions): Promise<void> {
	if (!options.clientPackage) return;

	client.emit('debug', `Extracting client package to ${options.root}`);
	await downloadAndExtractPackage(options);
}

async function configureLog4jForVersion(
	options: ILauncherOptions,
	jvm: string[],
	url: string
): Promise<void> {
	// Get game directory with fallback chain
	const gameDir = resolve(
		options.overrides?.gameDirectory || options.overrides?.cwd || options.root
	);

	// Define paths
	const LOG4J_CONFIG = {
		dir: join(gameDir, 'config'),
		fileName: 'log4j2.xml',
	} as const;

	const configPath = join(LOG4J_CONFIG.dir, LOG4J_CONFIG.fileName);

	// Ensure log4j directory exists
	mkdirSync(LOG4J_CONFIG.dir, { recursive: true });

	// Download and configure if doesn't exist
	if (!existsSync(configPath)) {
		await downloadAsync(
			url,
			LOG4J_CONFIG.dir,
			LOG4J_CONFIG.fileName,
			true,
			'log4j'
		);

		// Read, modify, and write in a more controlled way
		const configContent = readFileSync(configPath, 'utf8');
		const logsPath = join(gameDir, 'logs').replace(/\\/g, '/'); // Normalize path separators
		const updatedContent = configContent.replace(/logs\//g, `${logsPath}/`);
		writeFileSync(configPath, updatedContent);
	}

	// Add to JVM arguments
	jvm.push(`-Dlog4j.configurationFile=${configPath}`);
}
