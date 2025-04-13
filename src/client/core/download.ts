import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { client } from '../constants.ts';
import type { ILibrary } from '../types.ts';
import { parseRule } from '../utils/system.ts';

let counter = 0;

/**
 * Downloads a file from a URL with progress tracking
 * @param url - Source URL
 * @param directory - Target directory
 * @param name - File name
 * @param retry - Whether to retry on failure
 * @param type - Download type for progress tracking
 * @param timeoutms - Download timeout in milliseconds
 */
export async function downloadAsync(
	url: string,
	directory: string,
	name: string,
	retry: boolean,
	type: string,
	timeoutms = 50000
): Promise<void> {
	const filePath = join(directory, name);
	mkdirSync(directory, { recursive: true });

	try {
		// Setup fetch with timeout
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutms);
		const response = await fetch(url, {
			signal: controller.signal,
			headers: { Connection: 'keep-alive' },
		});
		clearTimeout(timeout);

		// Handle response errors
		if (!response.ok) {
			if (response.status === 404) {
				client.emit('debug', `File not found: ${url}`);
				return;
			}
			throw new Error(`HTTP ${response.status}`);
		}

		// Setup file writing
		const totalBytes = Number(response.headers.get('content-length'));
		const file = createWriteStream(filePath);
		const reader = response.body?.getReader();
		if (!reader) throw new Error('No reader available');

		// Download and write file
		let receivedBytes = 0;
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			receivedBytes += value.length;
			file.write(value);

			// Report progress
			client.emit('download-status', {
				name,
				type,
				current: receivedBytes,
				total: totalBytes,
			});
		}

		// Finish writing
		file.end();
		await new Promise<void>((resolve) => file.once('finish', resolve));
		client.emit('download', name);
	} catch {
		// Cleanup and retry if needed
		if (existsSync(filePath)) unlinkSync(filePath);
		if (retry) {
			await downloadAsync(url, directory, name, false, type);
		}
	}
}

export async function downloadToDirectory(
	directory: string,
	libraries: ILibrary[],
	eventName: string
) {
	const libs: string[] = [];

	await Promise.all(
		libraries.map(async (library) => {
			if (!library) return;
			if (parseRule(library)) return;
			const lib = library.name.split(':');

			let jarPath: string;
			let name: string;
			if (library.downloads?.artifact?.path) {
				name =
					library.downloads.artifact.path.split('/')[
						library.downloads.artifact.path.split('/').length - 1
					] || '';
				jarPath = join(
					directory,
					library.downloads.artifact.path.split('/').slice(0, -1).join('/')
				);
			} else {
				name = `${lib[1]}-${lib[2]}${lib[3] ? `-${lib[3]}` : ''}.jar`;
				jarPath = join(
					directory,
					`${(lib[0] || '').replace(/\./g, '/')}/${lib[1]}/${lib[2]}`
				);
			}

			const downloadLibrary = async (library: ILibrary) => {
				if (library.url) {
					const url = `${library.url}${(lib[0] || '').replace(/\./g, '/')}/${lib[1]}/${lib[2]}/${name}`;
					await downloadAsync(url, jarPath, name, true, eventName);
				} else if (library.downloads?.artifact?.url) {
					// Only download if there's a URL provided. If not, we're assuming it's going a generated dependency.
					await downloadAsync(
						library.downloads.artifact.url,
						jarPath,
						name,
						true,
						eventName
					);
				}
			};

			if (!existsSync(join(jarPath, name))) {
				await downloadLibrary(library);
			}
			if (
				library.downloads?.artifact &&
				!customCheckSum(library.downloads.artifact.sha1, join(jarPath, name))
			) {
				await downloadLibrary(library);
			}
			counter++;
			client.emit('progress', {
				type: eventName,
				task: counter,
				total: libraries.length,
			});
			libs.push(`${jarPath}${sep}${name}`);
		})
	);
	counter = 0;

	return libs;
}

export async function customCheckSum(
	hash: string,
	filename: string
): Promise<boolean> {
	try {
		const buffer = await readFile(filename);
		const fileHash = createHash('sha1').update(buffer).digest('hex');
		return hash === fileHash;
	} catch (err) {
		client.emit('debug', `Failed to check file hash due to ${err}`);
		return false;
	}
}
