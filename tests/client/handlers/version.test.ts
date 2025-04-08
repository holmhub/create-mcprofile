import { expect, test, mock, beforeEach } from 'bun:test';
import {
	getVersionManifest,
	getJar,
	parseVersion,
} from '../../../src/client/handlers/version.ts';
import type {
	ILauncherOptions,
	IVersionManifest,
} from '../../../src/client/types.ts';

const mockOptions: ILauncherOptions = {
	root: 'test-root',
	directory: 'test-dir',
	version: {
		number: '1.20.1',
		type: '',
		custom: undefined,
	},
	overrides: {
		url: {
			meta: 'https://test.meta',
		},
	},
	memory: {
		max: '',
		min: '',
	},
	authorization: {
		access_token: '',
		client_token: '',
		uuid: '',
		name: '',
		user_properties: '',
	},
};

const mockVersion: IVersionManifest = {
	downloads: {
		client: {
			url: 'https://test.download/client.jar',
		},
	},
	id: '',
	type: 'release',
	time: '',
	assets: '',
	releaseTime: '',
	arguments: {
		game: [],
	},
	minecraftArguments: '',
	minimumLauncherVersion: 0,
	mainClass: '',
	libraries: [],
	mavenFiles: [],
	assetIndex: {
		url: '',
	},
	logging: {
		client: {
			argument: '',
			file: {
				id: '',
				sha1: '',
				size: 0,
				url: '',
			},
			type: '',
		},
	},
};

beforeEach(() => {
	mock.restore();
	mock.module('node:fs', () => ({
		existsSync: () => false,
		mkdirSync: () => {},
		readFileSync: () => '{}',
	}));
	mock.module('../../../src/client/core/download', () => ({
		downloadAsync: () => Promise.resolve(),
	}));
	mock.module('../../../src/client', () => ({
		client: { emit: () => {} },
	}));
});

test('getVersionManifest handles missing directory', async () => {
	await expect(
		getVersionManifest({ ...mockOptions, directory: undefined })
	).rejects.toThrow('Directory is required');
});

test('getVersionManifest loads local version file', async () => {
	mock.module('node:fs', () => ({
		existsSync: () => true,
		readFileSync: () => JSON.stringify(mockVersion),
	}));

	const result = await getVersionManifest(mockOptions);
	expect(result).toEqual(mockVersion);
});

test('getJar downloads files successfully', async () => {
	const downloadMock = mock(() => Promise.resolve());
	mock.module('../../../src/client/core/download', () => ({
		downloadAsync: downloadMock,
	}));

	const result = await getJar(mockOptions, mockVersion);
	expect(result).toBe(true);
	expect(downloadMock).toHaveBeenCalled();
});

test('getJar handles errors gracefully', async () => {
	mock.module('../../../src/client/core/download', () => ({
		downloadAsync: () => Promise.reject(new Error('Download failed')),
	}));

	const result = await getJar(mockOptions, mockVersion);
	expect(result).toBe(false);
});

test('parseVersion handles various version formats', () => {
	expect(parseVersion('1.20.1')).toEqual({
		majorVersion: 1,
		minorVersion: 20,
		patchVersion: 1,
	});
	expect(parseVersion('1.20')).toEqual({
		majorVersion: 1,
		minorVersion: 20,
		patchVersion: 0,
	});
	expect(parseVersion('')).toEqual({
		majorVersion: 0,
		minorVersion: 0,
		patchVersion: 0,
	});
	expect(parseVersion(undefined)).toEqual({
		majorVersion: 0,
		minorVersion: 0,
		patchVersion: 0,
	});
});
