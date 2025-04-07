import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { client } from '..';
import { downloadToDirectory } from '../core/download';
import type { ILauncherOptions, IVersionManifest } from '../types';
import { parseRule } from '../utils/system';

export async function getClasses(
	classJson: IVersionManifest,
	options: ILauncherOptions,
	version: IVersionManifest,
) {
	let libs: string[] = [];

	const libraryDirectory = resolve(
		options.overrides?.libraryRoot || join(options.root, 'libraries'),
	);

	if (classJson) {
		if (classJson.mavenFiles) {
			await downloadToDirectory(
				libraryDirectory,
				classJson.mavenFiles,
				'classes-maven-custom',
			);
		}
		libs = await downloadToDirectory(
			libraryDirectory,
			classJson.libraries,
			'classes-custom',
		);
	}

	const parsed = version.libraries.filter((lib) => {
		if (lib.downloads?.artifact && !parseRule(lib)) {
			if (
				!classJson ||
				!classJson.libraries.some(
					(l) => l.name.split(':')[1] === lib.name.split(':')[1],
				)
			) {
				return true;
			}
		}
		return false;
	});

	libs = libs.concat(
		await downloadToDirectory(libraryDirectory, parsed, 'classes'),
	);

	client.emit('debug', 'Collected class paths');
	return libs;
}

export function getModifyJson(options: ILauncherOptions) {
	if (!options.version.custom) return null;

	const customVersionPath = join(
		options.root,
		'versions',
		options.version.custom,
		`${options.version.custom}.json`,
	);

	client.emit('debug', 'Loading custom version file');
	return JSON.parse(readFileSync(customVersionPath, 'utf-8'));
}
