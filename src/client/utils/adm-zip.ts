import AdmZip from 'adm-zip';
import { mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { normalize, resolve } from 'node:path';

/**
 * Extracts all files from a ZIP archive to a target directory
 * @param zipPath - Path to the ZIP file
 * @param targetPath - Directory where files will be extracted
 * @param overwrite - Whether to overwrite existing files (default: false)
 * @param progressCallback - Optional callback for extraction progress
 * @throws {Error} When file extraction fails
 */
export function extractSync(
	zipPath: string,
	targetPath: string,
	overwrite?: boolean,
	progressCallback?: (current: number, total: number) => void
): void {
	const zip = new AdmZip(zipPath);
	const entries = zip.getEntries();
	const totalEntries = entries.filter((entry) => !entry.isDirectory).length;
	let processedEntries = 0;

	// Process each entry
	for (const entry of entries) {
		const entryPath = resolve(targetPath, normalize(entry.entryName));

		// Create directory if needed
		if (entry.isDirectory) {
			mkdirSync(entryPath, { recursive: true });
			continue;
		}

		// Extract file content
		const content = entry.getData();
		if (!content) {
			throw new Error(`Cannot extract file: ${entry.entryName}`);
		}

		// Write file content
		writeFileSync(entryPath, content, {
			flag: overwrite ? 'w' : 'wx',
		});

		// Set original timestamps
		try {
			utimesSync(entryPath, entry.header.time, entry.header.time);
		} catch {}

		progressCallback?.(++processedEntries, totalEntries);
	}
}
