import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { client } from '..';
import { customCheckSum, downloadAsync } from '../core/download';
import type { IArtifact, ILauncherOptions, IVersionManifest } from '../types';
import { unzipFile } from '../utils/compressor';
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
				const nativePath = join(nativeDirectory, name);

				// Download the native file
				await downloadAsync(native.url, nativeDirectory, name, true, 'natives');

				// Verify checksum and redownload if needed
				if (!(await customCheckSum(native.sha1, nativePath))) {
					await downloadAsync(
						native.url,
						nativeDirectory,
						name,
						true,
						'natives',
					);
				}

				// Only try to unzip if the file exists
				if (existsSync(nativePath)) {
					await unzipFile(nativePath, nativeDirectory);
					unlinkSync(nativePath);
				}

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
