import type { LoaderType } from '@/cli/types';

type OS = 'windows' | 'osx' | 'linux';

interface IOverrides {
	/**
	 * The amount of launch arguments specified in the version file before it adds the default again
	 */
	minArgs?: number;
	minecraftJar?: string;
	versionJson?: string;
	versionName?: string;
	/**
	 * Folder, where the game process generates folders like saves and resource packs.
	 */
	gameDirectory?: string;
	/**
	 * Folder, where the Minecraft jar and version json are located.
	 */
	directory?: string;
	natives?: string;
	assetRoot?: string;
	assetIndex?: string;
	libraryRoot?: string;
	/**
	 * Working directory of the java process.
	 */
	cwd?: string;
	/**
	 * Whether or not the client is detached from the parent / launcher.
	 */
	detached?: boolean;
	/**
	 * List of classes.
	 * All class paths are required if you use this.
	 */
	classes?: string[];
	/**
	 * Max sockets for downloadAsync.
	 */
	maxSockets?: number;
	/**
	 * Urls to the Minecraft and Forge resource servers
	 *
	 * This is for launcher developers located in countries that have the Minecraft and Forge resource servers
	 * blocked for what ever reason. They obviously need to mirror the formatting of the original JSONs / file structures.
	 */
	url?: {
		/**
		 * List of versions.
		 */
		meta?: string;
		/**
		 * Minecraft resources.
		 */
		resource?: string;
		/**
		 * Forge resources.
		 */
		mavenForge?: string;
		/**
		 * for Forge only, you need to redefine the library url in the version json.
		 */
		defaultRepoForge?: string;
		/**
		 *
		 */
		fallbackMaven?: string;
	};
	/**
	 * Version of the ForgeWrapper which MCLC uses. This allows us to launch modern Forge.
	 */
	fw?: {
		baseUrl?: string;
		version?: string;
		sh1?: string;
		size?: number;
	};
	logj4ConfigurationFile?: string;
}

export interface ILauncherOptions {
	directory?: string;
	mcPath?: string;
	loader?: {
		name: LoaderType;
		version?: string;
	};
	/**
	 * Path where you want the launcher to work in.
	 * This will usually be your .minecraft folder
	 */
	root: string;
	/**
	 * OS override for minecraft natives
	 *
	 * @default will autodetect
	 */
	os?: OS;
	/**
	 * Array of custom Java arguments
	 */
	customArgs?: string[];
	/**
	 * Array of game argument feature flags
	 */
	features?: string[];
	/**
	 * minecraft version info
	 */
	version: {
		/**
		 * Actual version.
		 *
		 * @example '1.16.4'
		 */
		number: string;
		/**
		 * type of release, usually `release` or `snapshot`
		 */
		type?: 'release' | 'snapshot' | string;
		/**
		 * 	The name of the folder, jar file, and version json in the version folder.
		 *
		 * ` MCLC will look in the `versions` folder for this name
		 * @example '1.16.4-fabric'
		 */
		custom?: string;
	};
	memory?: {
		/**
		 * Min amount of memory being used by Minecraft.
		 */
		max: string | number;
		/**
		 * Max amount of memory being used by Minecraft.
		 */
		min: string | number;
	};
	/**
	 * Path to Forge Jar.
	 *
	 * Versions below 1.13 should be the "universal" jar while versions above 1.13+ should be the "installer" jar
	 */
	forge?: string;
	/**
	 * Path to the JRE executable file, will default to java if not entered.
	 */
	javaPath?: string;
	proxy?: {
		/**
		 * Host url to the proxy, don't include the port.
		 */
		host: string;
		/**
		 *  Username for the proxy.
		 *
		 * @default 8080
		 */
		port?: string;
		/**
		 * Username for the proxy.
		 */
		username?: string;
		/**
		 * Password for the proxy.
		 */
		password?: string;
	};
	/**
	 * Timeout on download requests.
	 */
	timeout?: number;
	window?: {
		/**
		 * Width of the Minecraft Client
		 */
		width?: number;
		/**
		 * Height of the Minecraft Client
		 */
		height?: number;
		/**
		 * Fullscreen the Minecraft Client.
		 */
		fullscreen?: boolean;
	};

	/**
	 * Allows the game to be launched directly into a world
	 */
	quickPlay?: {
		/**
		 * The type of world you want to join.
		 * Note, that versions prior to 1.20 only support "legacy"
		 */
		type: 'singleplayer' | 'multiplayer' | 'realms' | 'legacy';
		/**
		 * Represents the world you want to join
		 *
		 * For singleplayer this should be the folder name of the world
		 * For multiplayer this should be the IP address of the server
		 * For realms this should be the Realms ID
		 * legacy follows multiplayer format
		 */
		identifier: string;
		/**
		 * The specified path for logging (relative to the run directory)
		 */
		path?: string;
	};
	/**
	 * Json object redefining paths for better customization
	 */
	overrides?: IOverrides;

	authorization?: IUser;
	/**
	 * Path of json cache.
	 */
	cache?: string;
}

export interface IUser {
	access_token: string;
	client_token: string;
	uuid: string;
	name: string;
	user_properties: string;
	meta?: {
		type: 'mojang' | 'msa';
		demo?: boolean;
		xuid?: string;
		clientId?: string;
	};
}

export interface IGameArgument {
	rules?: Array<{
		features: Record<string, boolean>;
	}>;
	value: string | string[];
}

export interface IVersionManifest {
	id: string;
	type: 'release' | 'snapshot';
	time: string;
	assets: string;
	releaseTime: string;
	arguments: {
		game: Array<string | IGameArgument>;
	};
	minecraftArguments: string;
	minimumLauncherVersion: number;
	mainClass: string;
	libraries: ILibrary[];
	inheritsFrom: string;
	mavenFiles: ILibrary[];
	downloads: { client: { url: string; size: number; sha1: string } };
	assetIndex: { url: string };
	forgeWrapperVersion?: string;
	logging: {
		client: {
			argument: string;
			file: {
				id: string;
				sha1: string;
				size: number;
				url: string;
			};
			type: string;
		};
	};
}

export interface IArtifact {
	path: string;
	sha1: string;
	size: number;
	url: string;
}

export interface ILibrary {
	downloads: {
		artifact: IArtifact;
		classifiers?: {
			[key: string]: IArtifact;
		};
	};
	url?: string;
	name: string;
	rules?: IRule[];
	serverreq?: string;
	clientreq?: string;
}

export interface IRule {
	action: 'allow' | 'disallow';
	os?: {
		name: 'windows' | 'osx' | 'linux';
		arch?: string;
		version?: string;
	};
}

// Helper type for LWJGL library names
export type LWJGLLibrary =
	| 'lwjgl'
	| 'lwjgl-glfw'
	| 'lwjgl-jemalloc'
	| 'lwjgl-openal'
	| 'lwjgl-opengl'
	| 'lwjgl-stb'
	| 'lwjgl-tinyfd';

// Helper type for native platforms
export type NativePlatform =
	| 'natives-linux'
	| 'natives-macos'
	| 'natives-macos-arm64'
	| 'natives-windows'
	| 'natives-windows-arm64'
	| 'natives-windows-x86';

export interface VersionManifestResponse {
	versions: Version[];
}

export interface Version {
	id: string; // e.g., "1.21.2", "24w14a"
	type: VersionType; // "release" or "snapshot"
	url: string; // URL to version's JSON file
	time: string; // Last modified time
	releaseTime: string; // Initial release time
}

export type VersionType = 'release' | 'snapshot';

export type GameVersion = {
	version: string;
	stable: boolean;
};

export type LoaderConfig = {
	directory: string;
	gameVersion?: string;
	loaderVersion?: string;
};
