import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { downloadAndExtractPackage } from '../core/download.ts';
import { client } from '../index.ts';
import type { ILauncherOptions } from '../types.ts';

export function createRootDirectory({ root }: ILauncherOptions): void {
	if (existsSync(root)) return;

	client.emit('debug', 'Attempting to create root folder');
	mkdirSync(root);
}

export function createGameDirectory({ overrides }: ILauncherOptions): void {
	if (!overrides?.gameDirectory) return;

	const dir = resolve(overrides.gameDirectory);
	!existsSync(dir) && mkdirSync(dir, { recursive: true });
	overrides.gameDirectory = dir;
}

export function cleanUp<T>(array: T[] | Record<string, T>): T[] {
	if (Array.isArray(array)) {
		return [
			...new Set(
				array.filter((value): value is NonNullable<T> => value !== null),
			),
		];
	}
	return [
		...new Set(
			Object.values(array).filter(
				(value): value is NonNullable<T> => value !== null,
			),
		),
	];
}

export async function extractPackage(options: ILauncherOptions): Promise<void> {
	if (!options.clientPackage) return;

	client.emit('debug', `Extracting client package to ${options.root}`);
	await downloadAndExtractPackage(options);
}
