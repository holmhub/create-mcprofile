import { exec } from 'node:child_process';
import { client } from '../index.ts';
import { getOS } from '../utils/system.ts';

export async function checkJava(java: string): Promise<{
	run: boolean;
	version: string | undefined;
	arch: string | undefined;
}> {
	try {
		const { stderr = '' } = await new Promise<{ stderr: string }>(
			(resolve, reject) =>
				exec(`"${java}" -version`, (error, _, stderr = '') => {
					if (error) reject(error);
					resolve({ stderr });
				})
		);

		const version = stderr.match(/"(.*?)"/)?.[1];
		const arch = stderr.includes('64-Bit') ? '64-bit' : '32-Bit';
		client.emit('debug', `Using Java version ${version} ${arch}`);
		return {
			run: true,
			version,
			arch,
		};
	} catch (error) {
		client.emit('debug', `Couldn't start Minecraft due to: ${error}`);
		process.exit(1);
	}
}

export function getJVM() {
	const opts = {
		windows:
			'-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump',
		osx: '-XstartOnFirstThread',
		linux: '-Xss1M',
	};
	return opts[getOS()];
}
