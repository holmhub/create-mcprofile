import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { client } from '..';
import { downloadToDirectory } from '../core/download';
import type { ILauncherOptions, IVersionManifest } from '../types';
import { parseRule } from '../utils/system';

let counter = 0;

export async function getClasses(
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	classJson: any,
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
					// biome-ignore lint/suspicious/noExplicitAny: <explanation>
					(l: any) => l.name.split(':')[1] === lib.name.split(':')[1],
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
	counter = 0;

	client.emit('debug', 'Collected class paths');
	return libs;
}

export async function getModifyJson(options: ILauncherOptions) {
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
