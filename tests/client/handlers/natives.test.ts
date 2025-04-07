import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { getNatives } from '../../../src/client/handlers/natives.ts';
import type { IVersionManifest } from '../../../src/client/types.ts';

// Mock file system operations
mock.module('node:fs', () => ({
	existsSync: () => false,
	mkdirSync: () => {},
	readdirSync: () => [],
	unlinkSync: () => {},
}));

const mockOptions = {
	root: 'test/root',
	overrides: {
		cwd: 'test/cwd',
	},
	version: {
		number: '1.18.0',
		type: 'release',
		custom: undefined,
	},
	memory: {
		min: '1G',
		max: '2G',
	},
	authorization: {
		access_token: 'test-token',
		client_token: 'test-client',
		uuid: 'test-uuid',
		name: 'test-user',
		user_properties: '{}',
	},
};

const mockVersion: IVersionManifest = {
	assetIndex: {
		url: 'https://piston-meta.mojang.com/v1/packages/a21e1ded1a24ea1548dd8db0cf30b6acb02655a9/1.12.json',
	},
	assets: '1.12',
	downloads: {
		client: {
			url: 'https://piston-data.mojang.com/v1/objects/0f275bc1547d01fa5f56ba34bdc87d981ee12daf/client.jar',
		},
	},
	id: '1.12.2',
	libraries: [
		{
			downloads: {
				artifact: {
					path: 'org/lwjgl/lwjgl/lwjgl-platform/2.9.4-nightly-20150209/lwjgl-platform-2.9.4-nightly-20150209.jar',
					sha1: 'b04f3ee8f5e43fa3b162981b50bb72fe1acabb33',
					size: 22,
					url: 'https://libraries.minecraft.net/org/lwjgl/lwjgl/lwjgl-platform/2.9.4-nightly-20150209/lwjgl-platform-2.9.4-nightly-20150209.jar',
				},
				classifiers: {
					'natives-linux': {
						path: 'org/lwjgl/lwjgl/lwjgl-platform/2.9.4-nightly-20150209/lwjgl-platform-2.9.4-nightly-20150209-natives-linux.jar',
						sha1: '931074f46c795d2f7b30ed6395df5715cfd7675b',
						size: 578680,
						url: 'https://libraries.minecraft.net/org/lwjgl/lwjgl/lwjgl-platform/2.9.4-nightly-20150209/lwjgl-platform-2.9.4-nightly-20150209-natives-linux.jar',
					},
					'natives-osx': {
						path: 'org/lwjgl/lwjgl/lwjgl-platform/2.9.4-nightly-20150209/lwjgl-platform-2.9.4-nightly-20150209-natives-osx.jar',
						sha1: 'bcab850f8f487c3f4c4dbabde778bb82bd1a40ed',
						size: 426822,
						url: 'https://libraries.minecraft.net/org/lwjgl/lwjgl/lwjgl-platform/2.9.4-nightly-20150209/lwjgl-platform-2.9.4-nightly-20150209-natives-osx.jar',
					},
					'natives-windows': {
						path: 'org/lwjgl/lwjgl/lwjgl-platform/2.9.4-nightly-20150209/lwjgl-platform-2.9.4-nightly-20150209-natives-windows.jar',
						sha1: 'b84d5102b9dbfabfeb5e43c7e2828d98a7fc80e0',
						size: 613748,
						url: 'https://libraries.minecraft.net/org/lwjgl/lwjgl/lwjgl-platform/2.9.4-nightly-20150209/lwjgl-platform-2.9.4-nightly-20150209-natives-windows.jar',
					},
				},
			},
			name: 'org.lwjgl.lwjgl:lwjgl-platform:2.9.4-nightly-20150209',
			rules: [
				{
					action: 'allow',
				},
				{
					action: 'disallow',
					os: {
						name: 'osx',
					},
				},
			],
			url: '',
		},
	],
	logging: {
		client: {
			argument: '',
			file: {
				id: 'client-1.12.xml',
				sha1: 'bd65e7d2e3c237be76cfbef4c2405033d7f91521',
				size: 888,
				url: 'https://piston-data.mojang.com/v1/objects/bd65e7d2e3c237be76cfbef4c2405033d7f91521/client-1.12.xml',
			},
			type: 'log4j2-xml',
		},
	},
	mainClass: 'net.minecraft.client.main.Main',
	minecraftArguments: '',
	minimumLauncherVersion: 18,
	type: 'release',
	time: '',
	releaseTime: '',
	arguments: {
		game: [],
	},
	mavenFiles: [],
};

// Mock dependencies
mock.module('../../../src/client/utils/system', () => ({
	getOS: () => 'windows',
	parseRule: () => false,
}));

mock.module('../../../src/client/core/download', () => ({
	downloadAsync: mock(() => Promise.resolve()),
}));

mock.module('../../../src/client/utils/compressor', () => ({
	unzipFile: mock(() => Promise.resolve()),
}));

// Mock client events
mock.module('../../../src/client', () => ({
	client: {
		emit: mock(() => {}),
	},
}));

describe('natives handler', () => {
	beforeEach(() => {
		mock.restore();
		mock.module('node:fs', () => ({
			existsSync: () => false,
			mkdirSync: () => {},
			readdirSync: () => [],
			unlinkSync: () => {},
		}));
		mock.module('../../../src/client/utils/system', () => ({
			getOS: () => 'windows',
			parseRule: () => false,
		}));
		mock.module('../../../src/client/core/download', () => ({
			downloadAsync: mock(() => Promise.resolve()),
		}));
		mock.module('../../../src/client/utils/compressor', () => ({
			unzipFile: mock(() => Promise.resolve()),
		}));
		mock.module('../../../src/client', () => ({
			client: {
				emit: mock(() => {}),
			},
		}));
	});

	it('should skip natives for version 1.19+', async () => {
		const result = await getNatives(mockOptions, {
			...mockVersion,
			id: '1.19.0',
		});
		expect(result).toBe(mockOptions.overrides.cwd);
	});

	it('should return existing natives directory if already populated', async () => {
		mock.module('node:fs', () => ({
			existsSync: () => true,
			readdirSync: () => ['existing.dll'],
			mkdirSync: () => {},
			unlinkSync: () => {},
		}));

		const result = await getNatives(mockOptions, mockVersion);
		expect(result).toContain('natives');
	});

	it('should collect and process natives for windows', async () => {
		const downloadMock = mock(() => Promise.resolve());
		const unzipMock = mock(() => Promise.resolve());
		const emitMock = mock(() => {});

		mock.module('../../../src/client/core/download', () => ({
			downloadAsync: downloadMock,
		}));
		mock.module('../../../src/client/utils/compressor', () => ({
			unzipFile: unzipMock,
		}));
		mock.module('../../../src/client', () => ({
			client: {
				emit: emitMock,
			},
		}));

		const result = await getNatives(mockOptions, mockVersion);

		expect(result).toContain('natives');
		expect(downloadMock).toHaveBeenCalled();
		expect(unzipMock).toHaveBeenCalled();
		expect(emitMock).toHaveBeenCalledWith('progress', {
			type: 'natives',
			task: 0,
			total: 1,
		});
	});

	it('should handle OSX natives', async () => {
		mock.module('../../../src/client/utils/system', () => ({
			getOS: () => 'osx',
			parseRule: () => false,
		}));

		const osxVersion: IVersionManifest = {
			...mockVersion,
			libraries: [
				{
					downloads: {
						classifiers: {
							'natives-osx': {
								path: 'test/native.jar',
								sha1: 'test-sha1',
								size: 1000,
								url: 'test-url',
							},
						},
						artifact: {
							path: '',
							sha1: '',
							size: 0,
							url: '',
						},
					},
					name: 'test:lib:1.0',
					url: '',
				},
			],
		};

		const result = await getNatives(mockOptions, osxVersion);
		expect(result).toContain('natives');
	});

	it('should handle errors during native processing', async () => {
		const error = new Error('Download failed');
		mock.module('../../../src/client/core/download', () => ({
			downloadAsync: () => Promise.reject(error),
		}));

		await expect(getNatives(mockOptions, mockVersion)).rejects.toThrow(
			'Download failed',
		);
	});

	it('should handle macos natives classifier', async () => {
		mock.module('../../../src/client/utils/system', () => ({
			getOS: () => 'osx',
			parseRule: () => false,
		}));

		const macosVersion: IVersionManifest = {
			...mockVersion,
			libraries: [
				{
					downloads: {
						classifiers: {
							'natives-macos': {
								path: 'test/native.jar',
								sha1: 'test-sha1',
								size: 1000,
								url: 'test-url',
							},
						},
						artifact: {
							path: '',
							sha1: '',
							size: 0,
							url: '',
						},
					},
					name: 'test:lib:1.0',
					url: '',
				},
			],
		};

		const result = await getNatives(mockOptions, macosVersion);
		expect(result).toContain('natives');
	});
});
