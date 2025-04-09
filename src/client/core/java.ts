import { exec } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { client } from '../index.ts';
import { extractAllTo } from '../utils/adm-zip.ts';
import { getErrorMessage } from '../utils/other.ts';
import { getOS } from '../utils/system.ts';
import { downloadAsync } from './download.ts';

const execAsync = promisify(exec);

interface JavaSetupConfig {
	version: '8' | '21';
	baseUrl: string;
	urlPaths: {
		windows: string;
		osx: string;
		linux: string;
	};
}

const JVM_OPTIONS = {
	windows:
		'-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump',
	osx: '-XstartOnFirstThread',
	linux: '-Xss1M',
} as const;

/**
 * Checks Java installation and returns version number
 * @returns Version number (e.g., 8, 11, 17) or undefined if not found
 */
export async function checkJava(java: string): Promise<number | undefined> {
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
 * Gets JVM options for the current operating system
 */
export function getJVM(): string {
	const os = getOS();
	return JVM_OPTIONS[os] || '';
}

/**
 * Downloads and extracts Java 8 for legacy Minecraft versions
 * @returns Path to the java executable
 */
export function setupJava8(rootDir: string): Promise<string> {
	return setupJava(rootDir, {
		version: '8',
		baseUrl:
			'https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u392-b08',
		urlPaths: {
			windows: 'OpenJDK8U-jdk_x64_windows_hotspot_8u392b08.zip',
			osx: 'OpenJDK8U-jdk_x64_mac_hotspot_8u392b08.tar.gz',
			linux: 'OpenJDK8U-jdk_x64_linux_hotspot_8u392b08.tar.gz',
		},
	});
}

/**
 * Downloads and extracts Java 21 for modern Minecraft versions
 * @returns Path to the java executable
 */
export function setupJava21(rootDir: string): Promise<string> {
	return setupJava(rootDir, {
		version: '21',
		baseUrl:
			'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.1%2B12',
		urlPaths: {
			windows: 'OpenJDK21U-jdk_x64_windows_hotspot_21.0.1_12.zip',
			osx: 'OpenJDK21U-jdk_x64_mac_hotspot_21.0.1_12.tar.gz',
			linux: 'OpenJDK21U-jdk_x64_linux_hotspot_21.0.1_12.tar.gz',
		},
	});
}

async function setupJava(
	rootDir: string,
	config: JavaSetupConfig
): Promise<string> {
	const os = getOS();
	const javaDir = join(rootDir, 'runtime', `java-${config.version}`);
	const javaExecutable =
		os === 'windows'
			? join(javaDir, 'bin', 'java.exe')
			: join(javaDir, 'bin', 'java');

	if (existsSync(javaExecutable)) {
		client.emit('debug', `Using existing Java ${config.version} installation`);
		return javaExecutable;
	}

	try {
		const url = `${config.baseUrl}/${config.urlPaths[os]}`;
		const fileName = `java${config.version}.${os === 'windows' ? 'zip' : 'tar.gz'}`;
		const downloadPath = join(javaDir, fileName);

		if (!existsSync(downloadPath)) {
			client.emit('debug', `Downloading Java ${config.version}...`);
			await downloadAsync(
				url,
				javaDir,
				fileName,
				true,
				`java${config.version}`
			);
		}

		// Extract JDK
		client.emit('debug', `Extracting Java ${config.version}...`);
		extractAllTo(downloadPath, javaDir, true, (task, total) => {
			client.emit('progress', {
				type: 'extract',
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

		client.emit('debug', `Java ${config.version} setup complete`);
		return javaExecutable;
	} catch (error) {
		throw new Error(
			`Failed to setup Java ${config.version}: ${getErrorMessage(error)}`
		);
	}
}

// (async () => {
// 	client.on('debug', console.log);
// 	client.on('data', console.log);
// 	const { handleProgress } = await import('@/utils/progress.ts');
// 	client.on('progress', handleProgress);
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
// })();
