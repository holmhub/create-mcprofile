import AdmZip from 'adm-zip';
import { exec } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { client } from '../index.ts';
import { getOS } from '../utils/system.ts';
import { downloadAsync } from './download.ts';

const execAsync = promisify(exec);

interface JavaInfo {
	run: boolean;
	version: string | undefined;
	arch: string | undefined;
}

const JVM_OPTIONS = {
	windows:
		'-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump',
	osx: '-XstartOnFirstThread',
	linux: '-Xss1M',
} as const;

/**
 * Checks Java installation and returns version information
 * @throws Will exit process if Java check fails
 */
export async function checkJava(java: string): Promise<JavaInfo> {
	try {
		const { stderr = '' } = await execAsync(`"${java}" -version`);

		const versionMatch = stderr.match(/"(.*?)"/);
		const version = versionMatch?.[1];
		const arch = stderr.includes('64-Bit') ? '64-bit' : '32-Bit';

		if (!version) {
			throw new Error('Could not determine Java version');
		}

		client.emit('debug', `Using Java version ${version} ${arch}`);
		return { run: true, version, arch };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		client.emit('debug', `Failed to start Java: ${errorMessage}`);
		process.exit(1);
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
export async function setupJava8(rootDir: string): Promise<string> {
	const JAVA8_BASE_URL =
		'https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u392-b08';
	const JAVA8_URLS = {
		windows: `${JAVA8_BASE_URL}/OpenJDK8U-jdk_x64_windows_hotspot_8u392b08.zip`,
		osx: `${JAVA8_BASE_URL}/OpenJDK8U-jdk_x64_mac_hotspot_8u392b08.tar.gz`,
		linux: `${JAVA8_BASE_URL}/OpenJDK8U-jdk_x64_linux_hotspot_8u392b08.tar.gz`,
	} as const;

	const os = getOS();
	const javaDir = join(rootDir, 'runtime', 'java-8');
	const javaExecutable =
		os === 'windows'
			? join(javaDir, 'bin', 'java.exe')
			: join(javaDir, 'bin', 'java');

	// Return existing installation if found
	if (existsSync(javaExecutable)) {
		client.emit('debug', 'Using existing Java 8 installation');
		return javaExecutable;
	}

	try {
		// Download JDK if needed
		const url = JAVA8_URLS[os];
		const fileName = `java8.${os === 'windows' ? 'zip' : 'tar.gz'}`;
		const downloadPath = join(javaDir, fileName);

		if (!existsSync(downloadPath)) {
			client.emit('debug', 'Downloading Java 8...');
			await downloadAsync(url, javaDir, fileName, true, 'java8');
		}

		// Extract JDK
		client.emit('debug', 'Extracting Java 8...');
		const zip = new AdmZip(downloadPath);

		// Find root JDK directory
		const jdkFolder = zip
			.getEntries()
			.find((entry) => entry.isDirectory)
			?.entryName.replace(/\/$/, '');

		if (!jdkFolder) {
			throw new Error('Invalid JDK archive: Root directory not found');
		}

		// Extract and reorganize files
		zip.extractAllTo(javaDir, true);
		const jdkPath = join(javaDir, jdkFolder);

		// Import fs only when needed
		const { cpSync, rmSync } = require('node:fs');

		// Move files to correct location and cleanup
		cpSync(jdkPath, javaDir, { recursive: true });
		rmSync(jdkPath, { recursive: true, force: true });
		rmSync(downloadPath, { force: true });

		client.emit('debug', 'Java 8 setup complete');
		return javaExecutable;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to setup Java 8: ${message}`);
	}
}
