import { join, resolve } from 'node:path';
import { client } from '../constants.ts';
import { isLegacy } from '../handlers/assets.ts';
import type {
	IGameArgument,
	ILauncherOptions,
	IVersionManifest,
} from '../types.ts';

export async function getLaunchOptions(
	options: ILauncherOptions,
	version: IVersionManifest,
	modification?: IVersionManifest
) {
	const { window, proxy, features, customArgs } = options;

	const versionArgs =
		version.minecraftArguments?.split(' ') ?? version.arguments.game;
	const loaderArgs =
		modification?.minecraftArguments?.split(' ') ??
		modification?.arguments.game;

	let args: (string | IGameArgument)[] = versionArgs;
	if (loaderArgs) args = args.concat(loaderArgs);

	// Add minimum arguments if necessary
	const minArgs = options.overrides?.minArgs || isLegacy(version) ? 5 : 11;
	if (args.length < minArgs) args = args.concat(versionArgs);

	// Add custom arguments
	if (customArgs) args = args.concat(customArgs);

	// Handle demo mode
	if (
		options.authorization?.meta?.demo &&
		!features?.includes('is_demo_user')
	) {
		args.push('--demo');
	}

	// Define template fields
	const isLegacyVersion = isLegacy(version);
	const fields = getTemplateFields(options, isLegacyVersion);

	// Process arguments
	args = processArguments(args, fields, features);

	// Add window settings
	if (window) {
		if (window.fullscreen) {
			args.push('--fullscreen');
		} else {
			if (window.width) args.push('--width', String(window.width));
			if (window.height) args.push('--height', String(window.height));
		}
	}

	// Add quickPlay arguments
	if (options.quickPlay) {
		const quickPlayArgs = formatQuickPlay(options);
		if (quickPlayArgs) args = args.concat(quickPlayArgs);
	}

	// Add proxy settings
	if (proxy) {
		args.push(
			'--proxyHost',
			proxy.host,
			'--proxyPort',
			proxy.port ?? '8080',
			'--proxyUser',
			proxy.username ?? '',
			'--proxyPass',
			proxy.password ?? ''
		);
	}

	args = args.filter(
		(value) => typeof value === 'string' || typeof value === 'number'
	);

	return args;
}

/**
 * Generates template fields for Minecraft launch arguments
 */
function getTemplateFields(
	options: ILauncherOptions,
	isLegacyVersion = false
): Record<string, string | number> {
	const { authorization, window } = options;
	if (!authorization) {
		throw new Error(
			'No authorization provided. Please provide an authorization object.'
		);
	}
	authorization.meta ??= { type: 'mojang' };

	// Handle assets paths
	const assetRoot = resolve(
		options.overrides?.assetRoot ?? join(options.root, 'assets')
	);
	const assetPath = isLegacyVersion
		? join(options.root, 'resources')
		: assetRoot;

	return {
		'${auth_access_token}': authorization.access_token,
		'${auth_session}': authorization.access_token,
		'${auth_player_name}': authorization.name,
		'${auth_uuid}': authorization.uuid,
		'${auth_xuid}': authorization.meta.xuid ?? authorization.access_token,
		'${user_properties}': authorization.user_properties,
		'${user_type}': authorization.meta.type,
		'${version_name}': options.version.number ?? options.overrides?.versionName,
		'${assets_index_name}':
			options.overrides?.assetIndex ??
			options.version.custom ??
			options.version.number,
		'${game_directory}': options.overrides?.gameDirectory ?? options.root,
		'${assets_root}': assetPath,
		'${game_assets}': assetPath,
		'${version_type}': options.version.type ?? 'release',
		'${clientid}':
			authorization.meta.clientId ??
			authorization.client_token ??
			authorization.access_token,
		'${resolution_width}': window?.width ?? 856,
		'${resolution_height}': window?.height ?? 482,
	};
}

/**
 * Process and replace argument templates with actual values
 */
function processArguments(
	args: (string | IGameArgument)[],
	fields: Record<string, string | number>,
	features?: string[]
): string[] {
	const processedArgs: string[] = [];

	for (const arg of args) {
		if (typeof arg === 'string') {
			processedArgs.push(arg in fields ? String(fields[arg]) : arg);
			continue;
		}

		if (!arg || typeof arg !== 'object') continue;

		if ('rules' in arg && Array.isArray(arg.rules)) {
			if (features?.length === 0) continue;

			const requiredFeatures = arg.rules.flatMap((rule) =>
				rule.features ? Object.keys(rule.features) : []
			);

			if (features?.every((feature) => requiredFeatures.includes(feature))) {
				processedArgs.push(...[arg.value].flat());
			}
		} else if ('value' in arg) {
			processedArgs.push(...[arg.value].flat());
		}
	}

	return processedArgs;
}

/**
 * Formats quickPlay options into Minecraft launch arguments
 * @param {ILauncherOptions} options - The launcher options object
 * @returns {string[] | undefined} Array of launch arguments or undefined if invalid
 *
 * @example
 * // Launch directly into a singleplayer world
 * formatQuickPlay({
 *   quickPlay: {
 *     type: 'singleplayer',
 *     identifier: 'My World'
 *   }
 * });
 * // Returns: ['--quickPlaySingleplayer', 'My World']
 *
 * @example
 * // Connect to a multiplayer server
 * formatQuickPlay({
 *   quickPlay: {
 *     type: 'multiplayer',
 *     identifier: 'play.example.com'
 *   }
 * });
 * // Returns: ['--quickPlayMultiplayer', 'play.example.com']
 *
 * @example
 * // Connect to a legacy server with custom port
 * formatQuickPlay({
 *   quickPlay: {
 *     type: 'legacy',
 *     identifier: 'mc.server.com:25566'
 *   }
 * });
 * // Returns: ['--server', 'mc.server.com', '--port', '25566']
 *
 * @example
 * // Join a realm with specific path
 * formatQuickPlay({
 *   quickPlay: {
 *     type: 'realms',
 *     identifier: 'realm_id',
 *     path: '/world/spawn'
 *   }
 * });
 * // Returns: ['--quickPlayRealms', 'realm_id', '--quickPlayPath', '/world/spawn']
 */
function formatQuickPlay(options: ILauncherOptions): string[] | undefined {
	const { quickPlay } = options;
	if (!quickPlay) return;

	const types = {
		singleplayer: '--quickPlaySingleplayer',
		multiplayer: '--quickPlayMultiplayer',
		realms: '--quickPlayRealms',
		legacy: null,
	} as const;

	const { type, identifier, path } = quickPlay;

	if (!(type in types)) {
		client.emit(
			'debug',
			`Invalid quickPlay type. Expected: ${Object.keys(types).join(', ')}`
		);
		return;
	}

	if (type === 'legacy') {
		const [host = '', port = '25565'] = identifier.split(':');
		const args = ['--server', host, '--port', port];
		return path ? [...args, '--quickPlayPath', path] : args;
	}

	const args = [types[type], identifier].filter(Boolean);
	return path ? [...args, '--quickPlayPath', path] : args;
}

// (async () => {
// 	const options: ILauncherOptions = {
// 		root: 'out',
// 		version: {
// 			number: '1.20.1',
// 			custom: 'fabric-123',
// 			type: 'release',
// 		},
// 		memory: {
// 			max: '2G',
// 			min: '1G',
// 		},
// 		overrides: {
// 			detached: true,
// 			maxSockets: 4,
// 			gameDirectory: 'out\\versions\\1.20.1',
// 			directory: 'out\\versions\\1.20.1',
// 		},
// 		directory: 'out\\versions\\1.20.1',
// 		mcPath: 'out\\versions\\1.20.1\\undefined.jar',
// 		authorization: {
// 			access_token: '1111',
// 			client_token: '1111',
// 			uuid: '1111',
// 			name: 'Player',
// 			user_properties: '{}',
// 		},
// 	};
// 	const version: IVersionManifest = {
// 		id: '',
// 		type: 'release',
// 		time: '',
// 		assets: '',
// 		releaseTime: '',
// 		arguments: {
// 			game: [
// 				'--username',
// 				'${auth_player_name}',
// 				'--version',
// 				'${version_name}',
// 				'--gameDir',
// 				'${game_directory}',
// 				'--assetsDir',
// 				'${assets_root}',
// 				'--assetIndex',
// 				'${assets_index_name}',
// 				'--uuid',
// 				'${auth_uuid}',
// 				'--accessToken',
// 				'${auth_access_token}',
// 				'--clientId',
// 				'${clientid}',
// 				'--xuid',
// 				'${auth_xuid}',
// 				'--userType',
// 				'${user_type}',
// 				'--versionType',
// 				'${version_type}',
// 			],
// 		},
// 		minecraftArguments: '',
// 		minimumLauncherVersion: 0,
// 		mainClass: '',
// 		libraries: [],
// 		mavenFiles: [],
// 		downloads: {
// 			client: {
// 				url: '',
// 			},
// 		},
// 		assetIndex: {
// 			url: '',
// 		},
// 		logging: {
// 			client: {
// 				argument: '',
// 				file: {
// 					id: '',
// 					sha1: '',
// 					size: 0,
// 					url: '',
// 				},
// 				type: '',
// 			},
// 		},
// 	};
// 	console.log(await getLaunchOptions(options, version));
// })();
