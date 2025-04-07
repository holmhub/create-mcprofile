import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getAssets, isLegacy } from '../handlers/assets.ts';
import { getClasses, getModifyJson } from '../handlers/libraries.ts';
import { getNatives } from '../handlers/natives.ts';
import { getJar, getVersion } from '../handlers/version.ts';
import { client } from '../index.ts';
import type { ILauncherOptions, IVersionManifest } from '../types.ts';
import {
	cleanUp,
	createGameDirectory,
	createRootDirectory,
	extractPackage,
} from '../utils/files.ts';
import { getMemory } from '../utils/memory.ts';
import { getOS } from '../utils/system.ts';
import { downloadAsync } from './download.ts';
import { checkJava, getJVM } from './java.ts';

export async function init(options: ILauncherOptions) {
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

	const java = await checkJava(options.javaPath || 'java');
	if (!java.run) {
		client.emit('debug', `Couldn't start Minecraft due to: ${java.message}`);
		client.emit('close', 1);
	}

	createRootDirectory(options);
	createGameDirectory(options);

	extractPackage(options);

	const directory =
		options.overrides.directory ||
		join(
			options.root,
			'versions',
			options.version.custom ? options.version.custom : options.version.number
		);
	options.directory = directory;

	const versionFile = await getVersion(options);

	const mcPath =
		options.overrides.minecraftJar ||
		(options.version.custom
			? join(
					options.root,
					'versions',
					options.version.custom,
					`${options.version.custom}.jar`
				)
			: join(directory, `${options.version.number}.jar`));
	options.mcPath = mcPath;
	const nativePath = await getNatives(options, versionFile);

	if (!existsSync(mcPath)) {
		client.emit('debug', 'Attempting to download Minecraft version jar');
		await getJar(options, versionFile);
	}

	const modifyJson = await getModifyJson(options);

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
		if (Number.parseInt(versionFile.id.split('.')[1] || '') > 12)
			jvm.push(await getJVM());
	} else jvm.push(await getJVM());

	if (options.customArgs) jvm = jvm.concat(options.customArgs);
	if (options.overrides.logj4ConfigurationFile) {
		jvm.push(
			`-Dlog4j.configurationFile=${resolve(options.overrides.logj4ConfigurationFile)}`
		);
	}
	// https://help.minecraft.net/hc/en-us/articles/4416199399693-Security-Vulnerability-in-Minecraft-Java-Edition
	if (
		Number.parseInt(versionFile.id.split('.')[1] || '') === 18 &&
		!Number.parseInt(versionFile.id.split('.')[2] || '')
	)
		jvm.push('-Dlog4j2.formatMsgNoLookups=true');
	if (Number.parseInt(versionFile.id.split('.')[1] || '') === 17)
		jvm.push('-Dlog4j2.formatMsgNoLookups=true');
	if (
		Number.parseInt(versionFile.id.split('.')[1] || '') < 17 &&
		!jvm.find((arg) => arg.includes('Dlog4j.configurationFile'))
	) {
		const configPath = resolve(options.overrides.cwd || options.root);
		const intVersion = Number.parseInt(versionFile.id.split('.')[1] || '');
		if (intVersion >= 12) {
			await downloadAsync(
				'https://launcher.mojang.com/v1/objects/02937d122c86ce73319ef9975b58896fc1b491d1/log4j2_112-116.xml',
				configPath,
				'log4j2_112-116.xml',
				true,
				'log4j'
			);
			jvm.push('-Dlog4j.configurationFile=log4j2_112-116.xml');
		} else if (intVersion >= 7) {
			await downloadAsync(
				'https://launcher.mojang.com/v1/objects/dd2b723346a8dcd48e7f4d245f6bf09e98db9696/log4j2_17-111.xml',
				configPath,
				'log4j2_17-111.xml',
				true,
				'log4j'
			);
			jvm.push('-Dlog4j.configurationFile=log4j2_17-111.xml');
		}
	}

	const classes =
		options.overrides.classes ||
		cleanUp(await getClasses(modifyJson, options, versionFile));

	const classPaths = ['-cp'];
	const separator = getOS() === 'windows' ? ';' : ':';
	// Handling launch arguments.
	const file = modifyJson || versionFile;
	// So mods like fabric work.
	const jar = existsSync(mcPath)
		? `${separator}${mcPath}`
		: `${separator}${join(directory, `${options.version.number}.jar`)}`;
	classPaths.push(
		`${options.forge ? options.forge + separator : ''}${classes.join(separator)}${jar}`
	);
	classPaths.push(file.mainClass);

	client.emit('debug', 'Attempting to download assets');
	await getAssets(options, versionFile);

	// Forge -> Custom -> Vanilla
	const launchOptions = await getLaunchOptions(
		modifyJson,
		options,
		versionFile
	);

	const stringArgs = launchOptions.map((arg) =>
		typeof arg === 'string' ? arg : String(arg)
	);
	const launchArguments = args.concat(jvm, classPaths, stringArgs);

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
	modification: IVersionManifest,
	options: ILauncherOptions,
	version: IVersionManifest
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

	options.authorization = await Promise.resolve(options.authorization);
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
