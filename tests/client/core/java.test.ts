import { expect, test, mock, beforeEach, describe } from 'bun:test';
import { checkJava, getJVM } from '../../../src/client/core/java.ts';
import { client } from '../../../src/client/index.ts';

describe('java', () => {
	beforeEach(() => {
		mock.restore();
	});

	test('checkJava with valid Java installation', async () => {
		const result = await checkJava('java');
		expect(result.run).toBe(true);
	});

	test('checkJava with invalid Java path', async () => {
		const result = await checkJava('invalid_java_path');
		expect(result.run).toBe(false);
		expect(result.message).toBeDefined();
	});

	test('getJVM returns correct options for Windows', async () => {
		mock.module('../../src/client/utils/system', () => ({
			getOS: () => 'windows',
		}));

		const jvmOpt = await getJVM();
		expect(jvmOpt).toBe(
			'-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump'
		);
	});

	test('getJVM returns correct options for OSX', async () => {
		mock.module('../../../src/client/utils/system', () => ({
			getOS: () => 'osx',
			parseRule: () => false,
		}));

		const jvmOpt = await getJVM();
		expect(jvmOpt).toBe('-XstartOnFirstThread');
	});

	test('getJVM returns correct options for Linux', async () => {
		mock.module('../../../src/client/utils/system', () => ({
			getOS: () => 'linux',
			parseRule: () => false,
		}));

		const jvmOpt = await getJVM();
		expect(jvmOpt).toBe('-Xss1M');
	});

	test('checkJava emits debug event with version info', async () => {
		let debugMessage = '';
		client.on('debug', (msg) => {
			debugMessage = msg;
		});

		await checkJava('java');
		expect(debugMessage).toContain('Using Java version');
	});
});
