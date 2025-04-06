import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { client } from '..';
import { customCheckSum, downloadAsync } from '../core/download';
import type { ILauncherOptions, IVersionManifest } from '../types';

let counter = 0;

export async function getAssets(
	options: ILauncherOptions,
	version: IVersionManifest,
) {
	const assetDirectory = resolve(
		options.overrides?.assetRoot || join(options.root, 'assets'),
	);
	const assetId = options.version.custom || options.version.number;
	if (!existsSync(join(assetDirectory, 'indexes', `${assetId}.json`))) {
		await downloadAsync(
			version.assetIndex.url,
			join(assetDirectory, 'indexes'),
			`${assetId}.json`,
			true,
			'asset-json',
		);
	}

	const index = JSON.parse(
		readFileSync(join(assetDirectory, 'indexes', `${assetId}.json`), {
			encoding: 'utf8',
		}),
	);

	client.emit('progress', {
		type: 'assets',
		task: 0,
		total: Object.keys(index.objects).length,
	});

	await Promise.all(
		Object.keys(index.objects).map(async (asset) => {
			const hash = index.objects[asset].hash;
			const subhash = hash.substring(0, 2);
			const subAsset = join(assetDirectory, 'objects', subhash);

			if (
				!existsSync(join(subAsset, hash)) ||
				!(await customCheckSum(hash, join(subAsset, hash)))
			) {
				await downloadAsync(
					`${options.overrides?.url?.resource}/${subhash}/${hash}`,
					subAsset,
					hash,
					true,
					'assets',
				);
			}
			counter++;
			client.emit('progress', {
				type: 'assets',
				task: counter,
				total: Object.keys(index.objects).length,
			});
		}),
	);
	counter = 0;

	// Copy assets to legacy if it's an older Minecraft version.
	if (isLegacy(version)) {
		if (existsSync(join(assetDirectory, 'legacy'))) {
			client.emit(
				'debug',
				`The 'legacy' directory is no longer used as Minecraft looks for the resouces folder regardless of what is passed in the assetDirecotry launch option. I'd recommend removing the directory (${join(assetDirectory, 'legacy')})`,
			);
		}

		const legacyDirectory = join(options.root, 'resources');
		client.emit('debug', `Copying assets over to ${legacyDirectory}`);

		client.emit('progress', {
			type: 'assets-copy',
			task: 0,
			total: Object.keys(index.objects).length,
		});

		await Promise.all(
			Object.keys(index.objects).map(async (asset) => {
				const hash = index.objects[asset].hash;
				const subhash = hash.substring(0, 2);
				const subAsset = join(assetDirectory, 'objects', subhash);

				const legacyAsset = asset.split('/');
				legacyAsset.pop();

				if (!existsSync(join(legacyDirectory, legacyAsset.join('/')))) {
					mkdirSync(join(legacyDirectory, legacyAsset.join('/')), {
						recursive: true,
					});
				}

				if (!existsSync(join(legacyDirectory, asset))) {
					copyFileSync(join(subAsset, hash), join(legacyDirectory, asset));
				}
				counter++;
				client.emit('progress', {
					type: 'assets-copy',
					task: counter,
					total: Object.keys(index.objects).length,
				});
			}),
		);
	}
	counter = 0;

	client.emit('debug', 'Downloaded assets');
}

export function isLegacy(version: IVersionManifest) {
	return version.assets === 'legacy' || version.assets === 'pre-1.6';
}
