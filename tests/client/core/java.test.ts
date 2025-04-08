import { expect, test, mock, beforeEach } from 'bun:test';
import { checkJava, getJVM } from '../../../src/client/core/java.ts';
import { client } from '../../../src/client/index.ts';

beforeEach(() => {
	mock.restore();
	// Mock system utilities
	mock.module('../../../src/client/utils/system', () => ({
		getOS: () => 'windows',
		parseRule: () => false,
	}));
	// Mock child_process exec
	mock.module('node:child_process', () => ({
		exec: (
			cmd: string,
			callback: (error: Error | null, stdout: string) => void
		) => {
			if (cmd.includes('java')) {
				callback(null, 'java version "17.0.1"');
			} else {
				callback(new Error('Command failed'), '');
			}
		},
	}));
});

test('checkJava with valid Java installation', async () => {
	const result = await checkJava('java');
	expect(result.run).toBe(true);
});

test('checkJava with invalid Java path', async () => {
	const result = await checkJava('invalid_java_path');
	expect(result.run).toBe(false);
});

test('getJVM returns Windows options', () => {
	const jvmOpt = getJVM();
	expect(jvmOpt).toBe(
		'-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump'
	);
});

test('getJVM returns OSX options', async () => {
	mock.module('../../../src/client/utils/system', () => ({
		getOS: () => 'osx',
		parseRule: () => false,
	}));
	const jvmOpt = getJVM();
	expect(jvmOpt).toBe('-XstartOnFirstThread');
});

test('getJVM returns Linux options', async () => {
	mock.module('../../../src/client/utils/system', () => ({
		getOS: () => 'linux',
		parseRule: () => false,
	}));
	const jvmOpt = getJVM();
	expect(jvmOpt).toBe('-Xss1M');
});

test('checkJava emits debug event', async () => {
	let debugMessage = '';
	client.on('debug', (msg) => {
		debugMessage = msg;
	});
	await checkJava('java');
	expect(debugMessage).toContain('Using Java version');
});
