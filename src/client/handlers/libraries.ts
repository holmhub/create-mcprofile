import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { downloadToDirectory } from '../core/download.ts';
import { client } from '../index.ts';
import type { ILauncherOptions, IVersionManifest } from '../types.ts';
import { parseRule } from '../utils/system.ts';

export async function getClasses(
	options: ILauncherOptions,
	version: IVersionManifest,
	classJson?: IVersionManifest
) {
	let libs: string[] = [];

	const libraryDirectory = resolve(
		options.overrides?.libraryRoot || join(options.root, 'libraries')
	);

	if (classJson) {
		if (classJson.mavenFiles) {
			await downloadToDirectory(
				libraryDirectory,
				classJson.mavenFiles,
				'classes-maven-custom'
			);
		}
		libs = await downloadToDirectory(
			libraryDirectory,
			classJson.libraries,
			'classes-custom'
		);
	}

	const parsed = version.libraries.filter((lib) => {
		if (
			lib.downloads?.artifact &&
			!parseRule(lib) &&
			!classJson?.libraries.some(
				(l) => l.name.split(':')[1] === lib.name.split(':')[1]
			)
		) {
			return true;
		}
		return false;
	});

	libs = libs.concat(
		await downloadToDirectory(libraryDirectory, parsed, 'classes')
	);

	client.emit('debug', 'Collected class paths');
	return libs;
}

export function getModifyJson(
	options: ILauncherOptions
): IVersionManifest | undefined {
	if (!options.version.custom) {
		client.emit('debug', 'No custom version specified');
		return;
	}

	console.log(options.version.custom);

	const customVersionPath = join(
		options.root,
		'versions',
		options.version.custom,
		`${options.version.custom}.json`
	);

	if (!existsSync(customVersionPath)) {
		client.emit('debug', `Custom version file not found: ${customVersionPath}`);
		return;
	}

	try {
		client.emit('debug', 'Loading custom version file');
		return JSON.parse(readFileSync(customVersionPath, 'utf-8'));
	} catch (error) {
		client.emit('debug', `Failed to parse custom version file: ${error}`);
		return;
	}
}
