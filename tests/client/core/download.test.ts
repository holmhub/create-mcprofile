import { expect, test, mock, beforeEach } from 'bun:test';
import {
	downloadAsync,
	downloadAndExtractPackage,
	downloadToDirectory,
	customCheckSum,
} from '../../../src/client/core/download';
import { client } from '../../../src/client';
import { join } from 'node:path';
import { writeFileSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';

const TEST_DIR = 'e:\\Users\\Nicat\\Documents\\mclauncher\\tests\\temp';

beforeEach(() => {
	// Setup test directory
	if (!existsSync(TEST_DIR)) {
		mkdirSync(TEST_DIR, { recursive: true });
	}
});

test('downloadAsync handles successful download', async () => {
	const result = await downloadAsync(
		'https://example.com/test.txt',
		TEST_DIR,
		'test.txt',
		true,
		'test',
	);
	expect(result.failed).toBe(false);
});

test('downloadAsync handles 404', async () => {
	const result = await downloadAsync(
		'https://example.com/nonexistent',
		TEST_DIR,
		'nonexistent.txt',
		true,
		'test',
	);
	expect(result).toBe(false);
});

test('customCheckSum validates file hash', async () => {
	const testFile = join(TEST_DIR, 'test.txt');
	const content = 'test content';
	writeFileSync(testFile, content);

	const expectedHash = '4e1243bd22c66e76c2ba9eddc1f91394e57f9f83'; // SHA1 of 'test content'
	const result = await customCheckSum(expectedHash, testFile);
	expect(result).toBe(true);
});

test('customCheckSum handles invalid file', async () => {
	const result = await customCheckSum('somehash', 'nonexistent.txt');
	expect(result).toBe(false);
});

test('downloadAndExtractPackage handles HTTP package', async () => {
	const options = {
		clientPackage: 'https://example.com/package.zip',
		root: TEST_DIR,
		removePackage: true,
	};

	let extractEvent = false;
	client.on('package-extract', () => {
		extractEvent = true;
	});

	await downloadAndExtractPackage(options);
	expect(extractEvent).toBe(true);
});

test('downloadToDirectory handles library downloads', async () => {
	const libraries = [
		{
			name: 'org.test:library:1.0',
			downloads: {
				artifact: {
					url: 'https://example.com/lib.jar',
					path: 'org/test/library/1.0/library-1.0.jar',
					sha1: 'testhash',
				},
			},
		},
	];

	const result = await downloadToDirectory(TEST_DIR, libraries, 'test');
	expect(result).toBeArray();

	// Cleanup test directory after test
	if (existsSync(TEST_DIR)) {
		unlinkSync(TEST_DIR);
	}
});
