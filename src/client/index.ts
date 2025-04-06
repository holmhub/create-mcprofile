import { exec, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import {
	copyFileSync,
	createReadStream,
	createWriteStream,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	unlinkSync,
	writeFile,
	writeFileSync,
} from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { createUnzip } from 'node:zlib';
import { randomUUIDv7 } from 'bun';
import checksum from 'checksum';
import type {
	IArtifact,
	ILauncherOptions,
	ILibrary,
	IUser,
	IVersionManifest,
} from './types';

const writeFileAsync = promisify(writeFile);

let counter = 0;

const client = new EventEmitter();
client.on('debug', console.log);
client.on('data', console.log);
client.on('progress', (e: { type: string; task: string; total: number }) => {
	console.log(`Download progress: ${e.type} | ${e.task} | ${e.total}`);
});

export async function launch(options: ILauncherOptions): Promise<EventEmitter> {
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
		client.emit(
			'debug',
			`[MCLC]: Couldn't start Minecraft due to: ${java.message}`,
		);
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
			options.version.custom ? options.version.custom : options.version.number,
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
					`${options.version.custom}.jar`,
				)
			: join(directory, `${options.version.number}.jar`));
	options.mcPath = mcPath;
	const nativePath = await getNatives(options, versionFile);

	console.log(mcPath);

	if (!existsSync(mcPath)) {
		client.emit(
			'debug',
			'[MCLC]: Attempting to download Minecraft version jar',
		);
		await getJar(options, versionFile);
	}

	const modifyJson = await getModifyJson(options);

	console.log('modifyJson', modifyJson);

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
			`-Dlog4j.configurationFile=${resolve(options.overrides.logj4ConfigurationFile)}`,
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
	if (Number.parseInt(versionFile.id.split('.')[1] || '') < 17) {
		if (!jvm.find((arg) => arg.includes('Dlog4j.configurationFile'))) {
			const configPath = resolve(options.overrides.cwd || options.root);
			const intVersion = Number.parseInt(versionFile.id.split('.')[1] || '');
			if (intVersion >= 12) {
				await downloadAsync(
					'https://launcher.mojang.com/v1/objects/02937d122c86ce73319ef9975b58896fc1b491d1/log4j2_112-116.xml',
					configPath,
					'log4j2_112-116.xml',
					true,
					'log4j',
				);
				jvm.push('-Dlog4j.configurationFile=log4j2_112-116.xml');
			} else if (intVersion >= 7) {
				await downloadAsync(
					'https://launcher.mojang.com/v1/objects/dd2b723346a8dcd48e7f4d245f6bf09e98db9696/log4j2_17-111.xml',
					configPath,
					'log4j2_17-111.xml',
					true,
					'log4j',
				);
				jvm.push('-Dlog4j.configurationFile=log4j2_17-111.xml');
			}
		}

		return client;
	}

	const classes =
		options.overrides.classes ||
		cleanUp(await getClasses(modifyJson, options, versionFile));

	const classPaths = ['-cp'];
	const separator = getOS() === 'windows' ? ';' : ':';
	client.emit('debug', `[MCLC]: Using ${separator} to separate class paths`);
	// Handling launch arguments.
	const file = modifyJson || versionFile;
	// So mods like fabric work.
	const jar = existsSync(mcPath)
		? `${separator}${mcPath}`
		: `${separator}${join(directory, `${options.version.number}.jar`)}`;
	classPaths.push(
		`${options.forge ? options.forge + separator : ''}${classes.join(separator)}${jar}`,
	);
	classPaths.push(file.mainClass);

	client.emit('debug', '[MCLC]: Attempting to download assets');
	await getAssets(options, versionFile);

	// Forge -> Custom -> Vanilla
	const launchOptions = await getLaunchOptions(
		modifyJson,
		options,
		versionFile,
	);

	const launchArguments = args.concat(jvm, classPaths, launchOptions);
	client.emit('arguments', launchArguments);
	client.emit(
		'debug',
		`[MCLC]: Launching with arguments ${launchArguments.join(' ')}`,
	);

	return startMinecraft(launchArguments, options);
}

async function extractPackage(options: ILauncherOptions): Promise<void> {
	if (!options.clientPackage) return;

	client.emit('debug', `[MCLC]: Extracting client package to ${options.root}`);
	await downloadAndExtractPackage(options);
}

async function downloadAndExtractPackage(options: ILauncherOptions) {
	const { clientPackage, root, removePackage } = options;
	if (!clientPackage) return;

	if (clientPackage.startsWith('http')) {
		await downloadAsync(
			clientPackage,
			root,
			'clientPackage.zip',
			true,
			'client-package',
		);
		options.clientPackage = join(root, 'clientPackage.zip');
	}

	await pipeline(
		createReadStream(clientPackage),
		createUnzip(),
		createWriteStream(root),
	);

	if (removePackage) unlinkSync(clientPackage);

	return client.emit('package-extract', true);
}

async function downloadAsync(
	url: string,
	directory: string,
	name: string,
	retry: boolean,
	type: string,
) {
	try {
		mkdirSync(directory, { recursive: true });
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 50000); // 50s timeout

		const response = await fetch(url, {
			signal: controller.signal,
			headers: { Connection: 'keep-alive' },
		});
		clearTimeout(timeout);

		if (!response.ok) {
			if (response.status === 404) {
				client.emit(
					'debug',
					`[MCLC]: Failed to download ${url} due to: File not found...`,
				);
				return false;
			}
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const totalBytes = Number(response.headers.get('content-length'));
		let receivedBytes = 0;

		const file = createWriteStream(join(directory, name));
		const reader = response.body?.getReader();

		if (!reader) throw new Error('No reader available');

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			receivedBytes += value.length;
			file.write(value);

			client.emit('download-status', {
				name,
				type,
				current: receivedBytes,
				total: totalBytes,
			});
		}

		file.end();

		await new Promise<void>((resolve) => file.once('finish', () => resolve()));
		client.emit('download', name);

		return { failed: false, asset: null };
	} catch (error) {
		client.emit(
			'debug',
			`[MCLC]: Failed to download asset to ${join(directory, name)} due to\n${error}. Retrying... ${retry}`,
		);

		if (existsSync(join(directory, name))) {
			unlinkSync(join(directory, name));
		}

		if (retry) {
			return downloadAsync(url, directory, name, false, type);
		}

		return { failed: true, asset: null };
	}
}

async function checkJava(java: string) {
	try {
		const { stderr = '' } = await new Promise<{ stderr: string }>(
			(resolve, reject) =>
				exec(`"${java}" -version`, (error, _, stderr = '') => {
					if (error) reject(error);
					resolve({ stderr });
				}),
		);

		const version = stderr.match(/"(.*?)"/)?.[1];
		const arch = stderr.includes('64-Bit') ? '64-bit' : '32-Bit';
		client.emit('debug', `[MCLC]: Using Java version ${version} ${arch}`);
		return { run: true };
	} catch (error) {
		return { run: false, message: error };
	}
}

function createRootDirectory({ root }: ILauncherOptions): void {
	if (existsSync(root)) return;

	client.emit('debug', '[MCLC]: Attempting to create root folder');
	mkdirSync(root);
}

function createGameDirectory({ overrides }: ILauncherOptions): void {
	if (!overrides?.gameDirectory) return;

	const dir = resolve(overrides.gameDirectory);
	!existsSync(dir) && mkdirSync(dir, { recursive: true });
	overrides.gameDirectory = dir;
}

export function getAuth(username: string): IUser {
	const uuid = randomUUIDv7();

	return {
		access_token: uuid,
		client_token: uuid,
		uuid,
		name: username,
		user_properties: '{}',
	};
}

async function getVersion(
	options: ILauncherOptions,
): Promise<IVersionManifest> {
	if (!options.directory) {
		throw Error('No version directory specified');
	}

	const versionJsonPath =
		options.overrides?.versionJson ||
		join(options.directory, `${options.version.number}.json`);

	if (existsSync(versionJsonPath)) {
		const version = JSON.parse(readFileSync(versionJsonPath, 'utf-8'));
		return version;
	}

	const manifest = `${options.overrides?.url?.meta}/mc/game/version_manifest.json`;
	const cache = options.cache
		? `${options.cache}/json`
		: `${options.root}/cache/json`;

	try {
		const manifestResponse = await fetch(manifest);
		const manifestData = await manifestResponse.json();

		if (!existsSync(cache)) {
			mkdirSync(cache, { recursive: true });
			client.emit('debug', '[MCLC]: Cache directory created.');
		}

		await writeFileAsync(
			join(cache, 'version_manifest.json'),
			JSON.stringify(manifestData, null, 2),
		);
		client.emit('debug', '[MCLC]: Cached version_manifest.json');

		const desiredVersion = (
			manifestData as { versions: Array<{ id: string; url: string }> }
		).versions.find(
			(version: { id: string }) => version.id === options.version.number,
		);

		if (!desiredVersion) {
			throw Error(
				`Failed to find version ${options.version.number} in version_manifest.json`,
			);
		}

		const versionResponse = await fetch(desiredVersion.url);
		const versionData = (await versionResponse.json()) as IVersionManifest;

		await writeFileAsync(
			join(cache, `${options.version.number}.json`),
			JSON.stringify(versionData, null, 2),
		);
		client.emit('debug', `[MCLC]: Cached ${options.version.number}.json`);
		client.emit('debug', '[MCLC]: Parsed version from version manifest');

		return versionData;
	} catch (error) {
		// Attempt to load from cache if network request fails
		try {
			if (
				error instanceof Error &&
				'code' in error &&
				error.code === 'ENOTFOUND'
			) {
				const manifestCache = JSON.parse(
					readFileSync(join(cache, 'version_manifest.json'), 'utf-8'),
				);
				const versionCache = JSON.parse(
					readFileSync(join(cache, `${options.version.number}.json`), 'utf-8'),
				);
				return versionCache;
			}
			throw error;
		} catch (cacheError) {
			throw new Error(`Failed to get version: ${error}`);
		}
	}
}

async function getNatives(
	options: ILauncherOptions,
	version: IVersionManifest,
) {
	const nativeDirectory = resolve(
		options.overrides?.natives || join(options.root, 'natives', version.id),
	);

	if (Number.parseInt(version.id.split('.')[1] || '') >= 19)
		return options.overrides?.cwd || options.root;

	if (!existsSync(nativeDirectory) || !readdirSync(nativeDirectory).length) {
		mkdirSync(nativeDirectory, { recursive: true });

		const natives = async () => {
			const natives: IArtifact[] = [];
			await Promise.all(
				version.libraries.map(async (lib) => {
					if (!lib.downloads || !lib.downloads.classifiers) return;
					if (parseRule(lib)) return;

					const native =
						getOS() === 'osx'
							? lib.downloads.classifiers['natives-osx'] ||
								lib.downloads.classifiers['natives-macos']
							: lib.downloads.classifiers[`natives-${getOS()}`];
					if (native) natives.push(native);
				}),
			);
			return natives;
		};
		const stat = await natives();

		client.emit('progress', {
			type: 'natives',
			task: 0,
			total: stat.length,
		});

		await Promise.all(
			stat.map(async (native) => {
				if (!native) return;
				const name = native.path.split('/').pop() as string;
				await downloadAsync(native.url, nativeDirectory, name, true, 'natives');
				if (!(await customCheckSum(native.sha1, join(nativeDirectory, name)))) {
					await downloadAsync(
						native.url,
						nativeDirectory,
						name,
						true,
						'natives',
					);
				}
				try {
					await pipeline(
						createReadStream(join(nativeDirectory, name)),
						createUnzip(),
						createWriteStream(nativeDirectory),
					);
				} catch (e) {
					// Only doing a console.warn since a stupid error happens. You can basically ignore this.
					// if it says Invalid file name, just means two files were downloaded and both were deleted.
					// All is well.
					console.warn(e);
				}
				unlinkSync(join(nativeDirectory, name));
				counter++;
				client.emit('progress', {
					type: 'natives',
					task: counter,
					total: stat.length,
				});
			}),
		);
		client.emit('debug', '[MCLC]: Downloaded and extracted natives');
	}

	counter = 0;
	client.emit('debug', `[MCLC]: Set native path to ${nativeDirectory}`);

	return nativeDirectory;
}

function parseRule(lib: ILibrary): boolean {
	if (!lib.rules) return false;

	// Default to allow if no rules present
	let allowed = lib.rules.length === 0;

	for (const rule of lib.rules) {
		if (rule.os) {
			// Check if OS matches
			const osMatches = rule.os.name === getOS();

			// If OS matches and action is allow, set allowed to true
			// If OS matches and action is disallow, set allowed to false
			if (osMatches) {
				allowed = rule.action === 'allow';
			}
		} else {
			// No OS specified, apply rule globally
			allowed = rule.action === 'allow';
		}
	}

	return !allowed; // Return true if library should be excluded
}

function getOS() {
	switch (process.platform) {
		case 'win32':
			return 'windows';
		case 'darwin':
			return 'osx';
		default:
			return 'linux';
	}
}

async function getJar(options: ILauncherOptions, version: IVersionManifest) {
	if (!options.directory) {
		client.emit('debug', '[MCLC]: No version directory specified');
		return false;
	}
	await downloadAsync(
		version.downloads.client.url,
		options.directory,
		`${options.version.custom ? options.version.custom : options.version.number}.jar`,
		true,
		'version-jar',
	);
	writeFileSync(
		join(options.directory, `${options.version.number}.json`),
		JSON.stringify(version, null, 4),
	);
	return client.emit(
		'debug',
		'[MCLC]: Downloaded version jar and wrote version json',
	);
}

function customCheckSum(hash: string, filename: string) {
	return new Promise((resolve, reject) => {
		checksum.file(filename, (err, sum) => {
			if (err) {
				client.emit('debug', `[MCLC]: Failed to check file hash due to ${err}`);
				return resolve(false);
			}
			return resolve(hash === sum);
		});
	});
}

function cleanUp<T>(array: T[] | Record<string, T>): T[] {
	if (Array.isArray(array)) {
		return [
			...new Set(
				array.filter((value): value is NonNullable<T> => value !== null),
			),
		];
	}
	return [
		...new Set(
			Object.values(array).filter(
				(value): value is NonNullable<T> => value !== null,
			),
		),
	];
}

function getMemory(options: ILauncherOptions) {
	if (!options.memory) {
		client.emit('debug', '[MCLC]: Memory not set! Setting 1GB as MAX!');
		options.memory = {
			min: 512,
			max: 1023,
		};
	}

	// Parse memory values and convert to megabytes
	const parseMemory = (value: string | number): number => {
		if (typeof value === 'number') return value;
		const match = value.match(/^(\d+)(M|G)?$/i);
		if (!match) return 1024; // Default to 1GB if invalid format

		const [, num, unit] = match;
		return unit?.toUpperCase() === 'G'
			? Number.parseInt(String(num)) * 1024
			: Number.parseInt(String(num));
	};

	const maxMem = parseMemory(options.memory.max);
	const minMem = parseMemory(options.memory.min);

	// Ensure min is not greater than max
	if (minMem > maxMem) {
		client.emit('debug', '[MCLC]: MIN memory is higher than MAX! Resetting!');
		return ['1024M', '512M'];
	}

	return [`${maxMem}M`, `${minMem}M`];
}

async function getModifyJson(options: ILauncherOptions) {
	if (!options.version.custom) return null;

	const customVersionPath = join(
		options.root,
		'versions',
		options.version.custom,
		`${options.version.custom}.json`,
	);

	console.log('customVersionPath', customVersionPath);

	client.emit('debug', '[MCLC]: Loading custom version file');
	return JSON.parse(readFileSync(customVersionPath, 'utf-8'));
}

async function getJVM() {
	const opts = {
		windows:
			'-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump',
		osx: '-XstartOnFirstThread',
		linux: '-Xss1M',
	};
	return opts[getOS()];
}

async function getClasses(
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	classJson: any,
	options: ILauncherOptions,
	version: IVersionManifest,
) {
	let libs: string[] = [];

	console.log('getClasses', classJson);

	const libraryDirectory = resolve(
		options.overrides?.libraryRoot || join(options.root, 'libraries'),
	);

	if (classJson) {
		if (classJson.mavenFiles) {
			await downloadToDirectory(
				libraryDirectory,
				classJson.mavenFiles,
				'classes-maven-custom',
			);
		}
		libs = await downloadToDirectory(
			libraryDirectory,
			classJson.libraries,
			'classes-custom',
		);
	}

	const parsed = version.libraries.filter((lib) => {
		if (lib.downloads?.artifact && !parseRule(lib)) {
			if (
				!classJson ||
				!classJson.libraries.some(
					// biome-ignore lint/suspicious/noExplicitAny: <explanation>
					(l: any) => l.name.split(':')[1] === lib.name.split(':')[1],
				)
			) {
				return true;
			}
		}
		return false;
	});

	libs = libs.concat(
		await downloadToDirectory(libraryDirectory, parsed, 'classes'),
	);
	counter = 0;

	client.emit('debug', '[MCLC]: Collected class paths');
	return libs;
}

async function downloadToDirectory(
	directory: string,
	libraries: ILibrary[],
	eventName: string,
) {
	const libs: string[] = [];

	await Promise.all(
		libraries.map(async (library) => {
			if (!library) return;
			if (parseRule(library)) return;
			const lib = library.name.split(':');

			let jarPath: string;
			let name: string;
			if (library.downloads?.artifact?.path) {
				name =
					library.downloads.artifact.path.split('/')[
						library.downloads.artifact.path.split('/').length - 1
					] || '';
				jarPath = join(
					directory,
					library.downloads.artifact.path.split('/').slice(0, -1).join('/'),
				);
			} else {
				name = `${lib[1]}-${lib[2]}${lib[3] ? `-${lib[3]}` : ''}.jar`;
				jarPath = join(
					directory,
					`${(lib[0] || '').replace(/\./g, '/')}/${lib[1]}/${lib[2]}`,
				);
			}

			const downloadLibrary = async (library: ILibrary) => {
				if (library.url) {
					const url = `${library.url}${(lib[0] || '').replace(/\./g, '/')}/${lib[1]}/${lib[2]}/${name}`;
					await downloadAsync(url, jarPath, name, true, eventName);
				} else if (library.downloads?.artifact?.url) {
					// Only download if there's a URL provided. If not, we're assuming it's going a generated dependency.
					await downloadAsync(
						library.downloads.artifact.url,
						jarPath,
						name,
						true,
						eventName,
					);
				}
			};

			if (!existsSync(join(jarPath, name))) await downloadLibrary(library);
			if (library.downloads?.artifact) {
				if (
					!customCheckSum(library.downloads.artifact.sha1, join(jarPath, name))
				)
					await downloadLibrary(library);
			}

			counter++;
			client.emit('progress', {
				type: eventName,
				task: counter,
				total: libraries.length,
			});
			libs.push(`${jarPath}${sep}${name}`);
		}),
	);
	counter = 0;

	return libs;
}

async function getAssets(options: ILauncherOptions, version: IVersionManifest) {
	const assetDirectory = resolve(
		options.overrides?.assetRoot || join(options.root, 'assets'),
	);
	const assetId = options.version.custom || options.version.number;
	if (!existsSync(join(assetDirectory, 'indexes', `${assetId}.json`))) {
		await downloadAsync(
			version.assetIndex.url,
			join(assetDirectory, 'indexes'),
			`${assetId}.json`,
			true,
			'asset-json',
		);
	}

	const index = JSON.parse(
		readFileSync(join(assetDirectory, 'indexes', `${assetId}.json`), {
			encoding: 'utf8',
		}),
	);

	client.emit('progress', {
		type: 'assets',
		task: 0,
		total: Object.keys(index.objects).length,
	});

	await Promise.all(
		Object.keys(index.objects).map(async (asset) => {
			const hash = index.objects[asset].hash;
			const subhash = hash.substring(0, 2);
			const subAsset = join(assetDirectory, 'objects', subhash);

			if (
				!existsSync(join(subAsset, hash)) ||
				!(await customCheckSum(hash, join(subAsset, hash)))
			) {
				await downloadAsync(
					`${options.overrides?.url?.resource}/${subhash}/${hash}`,
					subAsset,
					hash,
					true,
					'assets',
				);
			}
			counter++;
			client.emit('progress', {
				type: 'assets',
				task: counter,
				total: Object.keys(index.objects).length,
			});
		}),
	);
	counter = 0;

	// Copy assets to legacy if it's an older Minecraft version.
	if (isLegacy(version)) {
		if (existsSync(join(assetDirectory, 'legacy'))) {
			client.emit(
				'debug',
				`[MCLC]: The 'legacy' directory is no longer used as Minecraft looks for the resouces folder regardless of what is passed in the assetDirecotry launch option. I'd recommend removing the directory (${join(assetDirectory, 'legacy')})`,
			);
		}

		const legacyDirectory = join(options.root, 'resources');
		client.emit('debug', `[MCLC]: Copying assets over to ${legacyDirectory}`);

		client.emit('progress', {
			type: 'assets-copy',
			task: 0,
			total: Object.keys(index.objects).length,
		});

		await Promise.all(
			Object.keys(index.objects).map(async (asset) => {
				const hash = index.objects[asset].hash;
				const subhash = hash.substring(0, 2);
				const subAsset = join(assetDirectory, 'objects', subhash);

				const legacyAsset = asset.split('/');
				legacyAsset.pop();

				if (!existsSync(join(legacyDirectory, legacyAsset.join('/')))) {
					mkdirSync(join(legacyDirectory, legacyAsset.join('/')), {
						recursive: true,
					});
				}

				if (!existsSync(join(legacyDirectory, asset))) {
					copyFileSync(join(subAsset, hash), join(legacyDirectory, asset));
				}
				counter++;
				client.emit('progress', {
					type: 'assets-copy',
					task: counter,
					total: Object.keys(index.objects).length,
				});
			}),
		);
	}
	counter = 0;

	client.emit('debug', '[MCLC]: Downloaded assets');
}

function isLegacy(version: IVersionManifest) {
	return version.assets === 'legacy' || version.assets === 'pre-1.6';
}

async function getLaunchOptions(
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	modification: any,
	options: ILauncherOptions,
	version: IVersionManifest,
) {
	const type = Object.assign({}, version, modification);

	let args = type.minecraftArguments
		? type.minecraftArguments.split(' ')
		: type.arguments.game;
	const assetRoot = resolve(
		options.overrides?.assetRoot || join(options.root, 'assets'),
	);
	const assetPath = isLegacy(version)
		? join(options.root, 'resources')
		: join(assetRoot);

	const minArgs = options.overrides?.minArgs || isLegacy(version) ? 5 : 11;
	if (args.length < minArgs)
		args = args.concat(
			version.minecraftArguments
				? version.minecraftArguments.split(' ')
				: version.arguments.game,
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
		index: number,
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
		if (typeof args[index] === 'object') {
			if (args[index]?.rules) {
				if (!options.features) continue;
				const featureFlags = [];
				for (const rule of args[index].rules) {
					featureFlags.push(...Object.keys(rule.features));
				}
				let hasAllRules = true;
				for (const feature of options.features) {
					if (!featureFlags.includes(feature)) {
						hasAllRules = false;
					}
				}
				if (hasAllRules) replaceArg(args[index], index);
			} else {
				replaceArg(args[index], index);
			}
		} else {
			if (Object.keys(fields).includes(args[index])) {
				args[index] = fields[args[index] as keyof typeof fields];
			}
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
			'[MCLC]: server and port are deprecated launch flags. Use the quickPlay field.',
		);
	if (options.quickPlay) args = args.concat(formatQuickPlay(options));
	if (options.proxy) {
		args.push(
			'--proxyHost',
			options.proxy.host,
			'--proxyPort',
			options.proxy.port || '8080',
			'--proxyUser',
			options.proxy.username,
			'--proxyPass',
			options.proxy.password,
		);
	}
	args = args.filter(
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		(value: any) => typeof value === 'string' || typeof value === 'number',
	);
	client.emit('debug', '[MCLC]: Set launch options');
	return args;
}

function formatQuickPlay(options: ILauncherOptions) {
	if (!options.quickPlay) return;

	const types = {
		singleplayer: '--quickPlaySingleplayer',
		multiplayer: '--quickPlayMultiplayer',
		realms: '--quickPlayRealms',
		legacy: null,
	};
	const { type, identifier, path } = options.quickPlay;
	const keys = Object.keys(types);
	if (!keys.includes(type)) {
		client.emit(
			'debug',
			`[MCLC]: quickPlay type is not valid. Valid types are: ${keys.join(', ')}`,
		);
		return;
	}
	const returnArgs =
		type === 'legacy'
			? [
					'--server',
					identifier.split(':')[0],
					'--port',
					identifier.split(':')[1] || '25565',
				]
			: [types[type], identifier];
	if (path) returnArgs.push('--quickPlayPath', path);
	return returnArgs;
}

function startMinecraft(launchArguments: string[], options: ILauncherOptions) {
	const minecraft = spawn(
		options.javaPath ? options.javaPath : 'java',
		launchArguments,
		{
			cwd: options.overrides?.cwd || options.root,
			detached: options.overrides?.detached,
		},
	);
	minecraft.stdout.on('data', (data) =>
		client.emit('data', data.toString('utf-8')),
	);
	minecraft.stderr.on('data', (data) =>
		client.emit('data', data.toString('utf-8')),
	);
	minecraft.on('close', (code) => client.emit('close', code));
	return minecraft;
}

// launch({
// 	clientPackage: undefined,
// 	authorization: getAuth('Nicat'),
// 	root: join(process.env.APPDATA || '', '.minecraft'),
// 	version: {
// 		number: '1.20.1',
// 		type: 'release',
// 	},
// 	memory: {
// 		max: '4G',
// 		min: '2G',
// 	},
// 	overrides: {
// 		maxSockets: 4,
// 	},
// });
