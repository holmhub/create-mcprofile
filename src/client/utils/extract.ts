import { mkdirSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { inflateRaw } from 'node:zlib';

type ZipEntry = [entryName: string, compressionType: number, rawData: Buffer];
type ZipProgressCallback = (bytesProcessed: number, totalBytes: number) => void;

interface ZipReader {
	/**
	 * Extracts all files from the archive to the specified directory
	 * @param directory - The target directory where all files will be extracted
	 * @returns Promise that resolves when all files have been extracted
	 */
	extractAll: (
		directory: string,
		onProgress?: ZipProgressCallback
	) => Promise<void>;

	/**
	 * Gets a specific entry from the archive by its name
	 * @param entryName - The name of the entry to retrieve (e.g., 'file.txt', 'folder/file.json')
	 * @returns Entry handler object if found, undefined otherwise
	 */
	getEntry: (entryName: string) => EntryReturnType | undefined;
}

interface EntryReturnType {
	/**
	 * Returns the raw decompressed buffer of the zip entry
	 * @returns Promise that resolves with the decompressed buffer
	 */
	getBuffer: () => Promise<Buffer>;

	/**
	 * Returns the content of the zip entry as text
	 * @param encoding - The character encoding to use (defaults to 'utf-8')
	 * @returns Promise that resolves with the text content
	 */

	// biome-ignore lint/correctness/noUndeclaredVariables: <explanation>
	getText: (encoding?: BufferEncoding) => Promise<string>;

	/**
	 * Extracts the zip entry to a file in the specified directory
	 * @param directory - The target directory where the file will be created
	 * @returns Promise that resolves when the file has been written
	 */
	extractTo: (directory: string) => Promise<void>;
}

const MIN_HEADER_SIZE = 30;
const ZIP_HEADER = 0x04034b50;
const CENTRAL_DIR_HEADER = 0x02014b50;
const STORE = 0;
const DEFLATE = 8;

/**
 * Creates a ZIP/JAR archive reader with methods to extract and read entries
 * @param archivePath - Path to the ZIP/JAR file to read
 * @returns ZipReader interface for accessing and extracting archive contents
 * @example
 * const zip = createZipReader('path/to/archive.zip');
 *
 * // Extract single file
 * const entry = zip.getEntry('file.txt');
 * if (entry) {
 *   const text = await entry.getText();
 *   await entry.extractTo('output/dir');
 * }
 *
 * // Extract all files
 * await zip.extractAll('output/dir');
 */
export function createZipReader(archivePath: string): ZipReader {
	const entries = getEntries(readFileSync(archivePath));

	return {
		extractAll: (directory, onProgress = () => {}) =>
			extract(archivePath, directory, onProgress),
		getEntry: (entryName) => {
			const entry = entries.get(entryName);
			if (!entry) return;

			const decompressPromise = decompressEntry(entry);
			return {
				getBuffer: () => decompressPromise,
				getText: async (encoding) =>
					(await decompressPromise).toString(encoding),
				extractTo: async (directory) =>
					writeFile(join(directory, entryName), await decompressPromise),
			};
		},
	};
}

/**
 * Simple archive extractor using only built-in Node.js modules
 * @param archivePath - Path to the ZIP/JAR file
 * @param outputDir - Directory to extract files to
 * @param onProgress - Progress callback
 */
export async function extract(
	archivePath: string,
	outputDir: string,
	onProgress: ZipProgressCallback = () => {}
): Promise<void> {
	const entries = getEntries(readFileSync(archivePath));
	onProgress(0, entries.size);

	const createdDirs = new Set<string>();
	let current = 0;
	const filePool: Promise<void>[] = [];
	for (const entry of entries.values()) {
		const file = extractEntry(entry, outputDir, createdDirs);
		if (!file) continue;
		file.then(() => {
			current++;
			onProgress(current, entries.size);
		});
		filePool.push(file);
	}
	await Promise.all(filePool);
}

function getEntries(buffer: Buffer<ArrayBufferLike>): Map<string, ZipEntry> {
	let offset = 0;
	const entries: Map<string, ZipEntry> = new Map([]);
	while (offset < buffer.length) {
		const [entry, nextOffset] = parseEntry(buffer, offset);
		if (entry) {
			entries.set(entry[0], entry);
		}
		offset = nextOffset;
	}
	return entries;
}

function parseEntry(buffer: Buffer, offset: number): [ZipEntry | null, number] {
	const signature = buffer.readUInt32LE(offset);
	if (signature === CENTRAL_DIR_HEADER) {
		return [null, buffer.length];
	}
	if (signature !== ZIP_HEADER) {
		return [null, offset + 1];
	}

	// Parse local file header
	const bitFlag = buffer.readUInt16LE(offset + 6);
	const compressionType = buffer.readUInt16LE(offset + 8);
	const compressedSize = buffer.readUInt32LE(offset + 18);
	const fileNameLength = buffer.readUInt16LE(offset + 26);
	const extraFieldLength = buffer.readUInt16LE(offset + 28);

	// Calculate correct data positions
	const headerEnd = offset + MIN_HEADER_SIZE;
	const fileNameEnd = headerEnd + fileNameLength;
	const extraFieldEnd = fileNameEnd + extraFieldLength;
	const dataStart = extraFieldEnd;

	// Handle data descriptor if present (bit 3 set)
	const hasDataDescriptor = (bitFlag & 0x0008) !== 0;
	const dataEnd = hasDataDescriptor
		? findNextEntry(buffer, dataStart)
		: dataStart + compressedSize;

	// Validate boundaries
	if (dataEnd > buffer.length) {
		return [null, offset + 1];
	}

	const entryName = buffer.subarray(headerEnd, fileNameEnd).toString();
	const rawData = buffer.subarray(dataStart, dataEnd);

	// Only return valid entries
	if (rawData.length > 0) {
		return [[entryName, compressionType, rawData], dataEnd];
	}
	return [null, dataEnd];
}

function decompressEntry([
	,
	compressionType,
	rawData,
]: ZipEntry): Promise<Buffer> {
	switch (compressionType) {
		case STORE:
			return Promise.resolve(rawData);

		case DEFLATE:
			return new Promise((resolve, reject) => {
				inflateRaw(rawData, (error, decompressed) => {
					if (error) {
						reject(new Error(`Decompression failed: ${error.message}`));
						return;
					}
					if (!decompressed) {
						reject(new Error('Decompression resulted in empty buffer'));
						return;
					}
					resolve(decompressed);
				});
			});

		default:
			return Promise.reject(
				new Error(`Unsupported compression method: ${compressionType}`)
			);
	}
}

async function extractEntry(
	[entryName, compressionType, rawData]: ZipEntry,
	outputDir: string,
	createdDirs?: Set<string>
): Promise<void> {
	// Normalize & verify the path to avoid zip-slip attacks
	const safeName = entryName.replace(/\\/g, '/'); // Convert backslashes
	if (safeName.includes('..')) {
		throw new Error(`Rejected potentially unsafe path: ${safeName}`);
	}

	// Create output file path
	const targetPath = join(outputDir, safeName);

	// Skip directories
	if (entryName.endsWith('/')) return;

	// Ensure parent directory exists
	const parentDir = dirname(targetPath);
	if (!createdDirs?.has(parentDir)) {
		mkdirSync(parentDir, { recursive: true });
		createdDirs?.add(parentDir);
	}

	const decompressedData = await decompressEntry([
		entryName,
		compressionType,
		rawData,
	]);

	return writeFile(targetPath, decompressedData);
}

function findNextEntry(buffer: Buffer, startOffset: number): number {
	for (let i = startOffset; i < buffer.length - 4; i++) {
		if (buffer.readUInt32LE(i) === ZIP_HEADER) {
			return i;
		}
	}
	return buffer.length;
}

// (async () => {
// 	const startTime = Date.now();
// 	// const result = await createZipReader('out/forge-installer.jar')
// 	// 	.getEntry('install_profile.json')
// 	// 	?.getText();
// 	// console.log(JSON.parse(result!).version);
// 	await createZipReader('out/forge-installer.jar').extractAll(
// 		'out/forge-installer'
// 	);
// 	console.log(`${Date.now() - startTime}ms`);
// })();

// async function extractZip(zipFilePath: string, outputDir: string) {
// 	try {
// 		const startTime = Date.now();
// 		console.log(`Extracting ${zipFilePath} to ${outputDir}`);
// 		await extract(zipFilePath, outputDir, (processed, total) => {
// 			const percentage = Math.round((processed / total) * 100);
// 			process.stdout.write(`Extracting... ${percentage}%\r`);
// 		});
// 		const endTime = Date.now();
// 		const duration = (endTime - startTime) / 1000;
// 		console.log(`\nExtraction completed in ${duration.toFixed(2)}s`);
// 		return true;
// 	} catch (error) {
// 		console.error('Error extracting ZIP file:', error);
// 		return false;
// 	}
// }
// extractZip('out/forge-installer.jar', 'out/forge-installer');
