import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { customCheckSum, downloadAsync } from '../core/download.ts';
import { client } from '../index.ts';
import type { ILauncherOptions, IVersionManifest } from '../types.ts';
import { getErrorMessage } from '../utils/other.ts';

interface AssetObject {
	hash: string;
	size?: number;
}

interface AssetIndex {
	objects: Record<string, AssetObject>;
}

const ERRORS = {
	ASSET_DOWNLOAD: (asset: string, error: unknown) =>
		`Failed to download asset ${asset}: ${error}`,
	ASSET_INDEX_PARSE: (path: string, error: unknown) =>
		`Failed to parse asset index at ${path}: ${error}`,
	LEGACY_COPY: (asset: string, error: unknown) =>
		`Failed to copy legacy asset ${asset}: ${error}`,
};

/**
 * Downloads and manages Minecraft assets
 * @param options - Launcher configuration options
 * @param version - Minecraft version manifest
 */
export async function getAssets(
	options: ILauncherOptions,
	version: IVersionManifest
): Promise<void> {
	const assetDirectory = resolve(
		options.overrides?.assetRoot || join(options.root, 'assets')
	);

	try {
		const assetIndex = await downloadAssetIndex(
			options,
			version,
			assetDirectory
		);
		await downloadAssetObjects(options, assetIndex, assetDirectory);

		if (isLegacy(version)) {
			await copyLegacyAssets(options, assetIndex, assetDirectory);
		}

		client.emit('debug', 'Downloaded assets');
	} catch (error) {
		client.emit('debug', `Asset processing failed: ${error}`);
		throw error;
	}
}

async function downloadAssetIndex(
	options: ILauncherOptions,
	version: IVersionManifest,
	assetDirectory: string
): Promise<AssetIndex> {
	const assetId = options.version.custom || options.version.number;
	const indexPath = join(assetDirectory, 'indexes', `${assetId}.json`);

	if (!existsSync(indexPath)) {
		await downloadAsync(
			version.assetIndex.url,
			join(assetDirectory, 'indexes'),
			`${assetId}.json`,
			true,
			'asset-json'
		);
	}

	try {
		return JSON.parse(readFileSync(indexPath, 'utf8'));
	} catch (error) {
		throw new Error(ERRORS.ASSET_INDEX_PARSE(indexPath, error));
	}
}

async function downloadAssetObjects(
	options: ILauncherOptions,
	index: AssetIndex,
	assetDirectory: string
): Promise<void> {
	const assets = Object.entries(index.objects);
	client.emit('progress', { type: 'assets', task: 0, total: assets.length });

	let completed = 0;
	await Promise.all(
		assets.map(async ([asset, { hash }]) => {
			try {
				await downloadAssetObject(options, hash, assetDirectory);
				client.emit('progress', {
					type: 'assets',
					task: ++completed,
					total: assets.length,
				});
			} catch (error) {
				throw new Error(ERRORS.ASSET_DOWNLOAD(asset, error));
			}
		})
	);
}

async function downloadAssetObject(
	options: ILauncherOptions,
	hash: string,
	assetDirectory: string
): Promise<void> {
	const subhash = hash.substring(0, 2);
	const subAsset = join(assetDirectory, 'objects', subhash);
	const assetPath = join(subAsset, hash);

	if (existsSync(assetPath) && (await customCheckSum(hash, assetPath))) {
		return;
	}

	await downloadAsync(
		`${options.overrides?.url?.resource}/${subhash}/${hash}`,
		subAsset,
		hash,
		true,
		'assets'
	);
}

async function copyLegacyAssets(
	options: ILauncherOptions,
	index: AssetIndex,
	assetDirectory: string
): Promise<void> {
	const legacyDirectory = join(options.root, 'resources');
	const assets = Object.entries(index.objects);

	client.emit('debug', `Copying assets to ${legacyDirectory}`);
	client.emit('progress', {
		type: 'assets-copy',
		task: 0,
		total: assets.length,
	});

	let completed = 0;
	await Promise.all(
		assets.map(([asset, { hash }]) => {
			try {
				copyLegacyAsset(asset, hash, assetDirectory, legacyDirectory);
				client.emit('progress', {
					type: 'assets-copy',
					task: ++completed,
					total: assets.length,
				});
			} catch (error) {
				client.emit(
					'debug',
					`Failed to copy asset ${asset}: ${getErrorMessage(error)}`
				);
			}
		})
	);
}

function copyLegacyAsset(
	asset: string,
	hash: string,
	assetDirectory: string,
	legacyDirectory: string
): void {
	const subhash = hash.substring(0, 2);
	const sourcePath = join(assetDirectory, 'objects', subhash, hash);
	const targetPath = join(legacyDirectory, ...asset.split('/'));

	const targetDir = join(
		legacyDirectory,
		asset.split('/').slice(0, -1).join('\\')
	);
	if (!existsSync(targetDir)) {
		mkdirSync(targetDir, { recursive: true });
	}

	if (!existsSync(targetPath)) {
		copyFileSync(sourcePath, targetPath);
	}
}

/**
 * Checks if the Minecraft version uses legacy asset system
 */
export function isLegacy(version: IVersionManifest): boolean {
	return version.assets === 'legacy' || version.assets === 'pre-1.6';
}

// (async () => {
// 	client.on('debug', console.log);
// 	client.on('data', console.log);
// 	const { handleProgress } = await import('@/utils/progress.ts');
// 	client.on('progress', handleProgress);
// 	const { initializeLauncherOptions } = await import('@/client/core/launch.ts');
// 	const options = initializeLauncherOptions({
// 		root: 'out',
// 		version: { number: '1.7.5' },
// 	});
// 	const { getVersionManifest } = await import('@/client/handlers/version.ts');
// 	const version = await getVersionManifest(options);
// 	await getAssets(options, version);
// })();
