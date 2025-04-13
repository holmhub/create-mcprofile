import { exec } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { client } from '../constants.ts';
import { parseVersion } from '../handlers/version.ts';
import type { ILauncherOptions } from '../types.ts';
import { extract } from '../utils/extract.ts';
import { getErrorMessage } from '../utils/other.ts';
import { getOS } from '../utils/system.ts';
import { downloadAsync } from './download.ts';

const JAVA_LTS = 21;
const JAVA_LEGACY = 6;
const JVM_OPTIONS = {
	windows:
		'-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump',
	osx: '-XstartOnFirstThread',
	linux: '-Xss1M',
} as const;
const execAsync = promisify(exec);

/**
 * Selects appropriate Java version for Minecraft and returns the path to Java executable
 * @param options Launcher options containing Java path and Minecraft version
 * @returns Path to the Java executable
 */
export async function selectJavaPath(
	options: ILauncherOptions
): Promise<string> {
	client.emit('debug', 'Checking Java installation...');
	const javaPath = options.javaPath || 'java';
	const minorVersion = parseVersion(options.version.number).minorVersion;
	const javaVersion = await getJavaVersion(javaPath);

	if (!javaVersion) {
		// No Java found, install appropriate version
		return minorVersion < 7
			? await installJDK(JAVA_LEGACY, options.root)
			: await installJDK(JAVA_LTS, options.root);
	}

	if (javaVersion > JAVA_LEGACY && minorVersion < 7) {
		// Java version too new for legacy MC
		client.emit(
			'debug',
			`Java ${javaVersion} not compatible with MC ${options.version.number}, installing Java ${JAVA_LEGACY}`
		);
		return await installJDK(JAVA_LEGACY, options.root);
	}

	return javaPath;
}

/**
 * Gets JVM options specific to the current operating system
 * @returns JVM argument string for the current OS
 */
export function getJVM(): string {
	const os = getOS();
	return JVM_OPTIONS[os] || '';
}

/**
 * Checks installed Java version
 * @param javaPath Path to Java executable
 * @returns Java major version number or undefined if not found
 */
async function getJavaVersion(java: string): Promise<number | undefined> {
	try {
		const { stderr = '' } = await execAsync(`"${java}" -version`);
		const version = Number(stderr.match(/"(\d+)/)?.[1]);
		if (Number.isNaN(version)) throw new Error('Failed to parse Java version');
		client.emit('debug', `Found Java version: ${version}`);
		return version;
	} catch (error) {
		client.emit('debug', `Failed to check Java: ${getErrorMessage(error)}`);
		return;
	}
}

/**
 * Fetches download URL for Azul Zulu JDK
 * @param javaVersion Java major version number
 * @returns Download URL for the JDK
 */
async function getJDKDownloadUrl(version: number): Promise<string> {
	const os = getOS();
	const osMap = { windows: 'windows', osx: 'macos', linux: 'linux' };
	const response = await fetch(
		`https://api.azul.com/zulu/download/community/v1.0/bundles/latest/?jdk_version=${version}&bundle_type=jdk&arch=x64&ext=zip&os=${osMap[os]}`
	);
	const release = (await response.json()) as { url: string };
	return release.url;
}

/**
 * Downloads and installs Java Development Kit
 * @param javaVersion Java major version to install
 * @param installDir Base directory for installation
 * @returns Path to the installed Java executable
 */
async function installJDK(version: number, dir: string) {
	const os = getOS();
	const javaDir = join(dir, 'runtime', `java-${version}`);
	const javaExecutable =
		os === 'windows'
			? join(javaDir, 'bin', 'java.exe')
			: join(javaDir, 'bin', 'java');

	if (existsSync(javaExecutable)) {
		client.emit('debug', `Using existing Java ${version} installation`);
		return javaExecutable;
	}

	try {
		const url = await getJDKDownloadUrl(version);
		const fileName = `java${version}.${os === 'windows' ? 'zip' : 'tar.gz'}`;
		const downloadPath = join(javaDir, fileName);

		if (!existsSync(downloadPath)) {
			client.emit('debug', `Downloading Java ${version}...`);
			await downloadAsync(url, javaDir, fileName, true, 'java-download');
		}

		// Extract JDK
		client.emit('debug', `Extracting Java ${version}...`);

		extract(downloadPath, javaDir, (task, total) => {
			client.emit('extract-status', {
				type: 'java-extract',
				task: task,
				total: total,
			});
		});

		// Get JDK path
		const jdkFolder = readdirSync(javaDir, { withFileTypes: true }).find(
			(file) => file.isDirectory()
		)?.name;
		if (!jdkFolder) throw new Error('Failed to find JDK folder');
		const jdkPath = join(javaDir, jdkFolder);

		// Move files to correct location and cleanup
		const { cpSync, rmSync } = require('node:fs');
		cpSync(jdkPath, javaDir, { recursive: true });
		rmSync(jdkPath, { recursive: true, force: true });
		rmSync(downloadPath, { force: true });

		client.emit('debug', `Java ${version} setup complete`);
		return javaExecutable;
	} catch (error) {
		throw new Error(
			`Failed to setup Java ${version}: ${getErrorMessage(error)}`
		);
	}
}

// (async () => {
// 	client.on('debug', console.log);
// 	client.on('data', console.log);
// 	const { handleProgress, handleDownloadStatus } = await import(
// 		'@/utils/progress.ts'
// 	);
// 	client.on('progress', handleProgress);
// 	client.on('download-status', handleDownloadStatus);
// 	const { rmSync } = require('node:fs');
// 	try {
// 		rmSync('out/runtime/java-21', {
// 			recursive: true,
// 			force: true,
// 		});
// 	} catch {}
// 	const minorVersion = 14;
// 	let java = 'java';
// 	const version = await checkJava(java);
// 	if ((!version || version > 8) && minorVersion < 7)
// 		java = await setupJava8('out');
// 	else if (!version) java = await setupJava21('out');
// 	if (java) await checkJava(java);
// 	console.log(await getAzulUrl(21));
// })();
