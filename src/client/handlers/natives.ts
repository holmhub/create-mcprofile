import {
	createReadStream,
	createWriteStream,
	existsSync,
	mkdirSync,
	readdirSync,
	unlinkSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createUnzip } from 'node:zlib';
import { client } from '..';
import { customCheckSum, downloadAsync } from '../core/download';
import type { IArtifact, ILauncherOptions, IVersionManifest } from '../types';
import { getOS, parseRule } from '../utils/system';

let counter = 0;

export async function getNatives(
	options: ILauncherOptions,
	version: IVersionManifest,
) {
	const nativeDirectory = resolve(
		options.overrides?.natives || join(options.root, 'natives', version.id),
	);

	if (Number.parseInt(version.id.split('.')[1] || '') >= 19)
		return options.overrides?.cwd || options.root;

	if (!existsSync(nativeDirectory) || !readdirSync(nativeDirectory).length) {
		mkdirSync(nativeDirectory, { recursive: true });

		const natives = async () => {
			const natives: IArtifact[] = [];
			await Promise.all(
				version.libraries.map(async (lib) => {
					if (!lib.downloads || !lib.downloads.classifiers) return;
					if (parseRule(lib)) return;

					const native =
						getOS() === 'osx'
							? lib.downloads.classifiers['natives-osx'] ||
								lib.downloads.classifiers['natives-macos']
							: lib.downloads.classifiers[`natives-${getOS()}`];
					if (native) natives.push(native);
				}),
			);
			return natives;
		};
		const stat = await natives();

		client.emit('progress', {
			type: 'natives',
			task: 0,
			total: stat.length,
		});

		await Promise.all(
			stat.map(async (native) => {
				if (!native) return;
				const name = native.path.split('/').pop() as string;
				await downloadAsync(native.url, nativeDirectory, name, true, 'natives');
				if (!(await customCheckSum(native.sha1, join(nativeDirectory, name)))) {
					await downloadAsync(
						native.url,
						nativeDirectory,
						name,
						true,
						'natives',
					);
				}
				await pipeline(
					createReadStream(join(nativeDirectory, name)),
					createUnzip(),
					createWriteStream(nativeDirectory),
				);
				unlinkSync(join(nativeDirectory, name));
				counter++;
				client.emit('progress', {
					type: 'natives',
					task: counter,
					total: stat.length,
				});
			}),
		);
		client.emit('debug', 'Downloaded and extracted natives');
	}

	counter = 0;
	client.emit('debug', `Set native path to ${nativeDirectory}`);

	return nativeDirectory;
}
