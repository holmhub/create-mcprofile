import { readFileSync } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { inflateRaw } from 'node:zlib';
import { getErrorMessage } from './other.ts';

type ZipEntry = [entryName: string, compressionType: number, rawData: Buffer];
type ZipProgressCallback = (bytesProcessed: number, totalBytes: number) => void;

type BufferEncoding =
	| 'ascii'
	| 'utf8'
	| 'utf-8'
	| 'utf16le'
	| 'utf-16le'
	| 'ucs2'
	| 'ucs-2'
	| 'base64'
	| 'base64url'
	| 'latin1'
	| 'binary'
	| 'hex';

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
	getText: (encoding?: BufferEncoding) => Promise<string>;

	/**
	 * Extracts the zip entry to a file in the specified directory
	 * @param directory - The target directory where the file will be created
	 * @returns Promise that resolves when the file has been written
	 */
	extractTo: (directory: string) => Promise<void>;
}

const MIN_LOCAL_HEADER_SIZE = 30;
const MIN_CDFH_SIZE = 46;
const EOCD_MIN_SIZE = 22;
const CENTRAL_DIR_HEADER = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;
const CONCURRENCY_LIMIT = 10; // Default concurrency limit for extraction
const STORE = 0;
const DEFLATE = 8;

/**
 * Creates a ZIP or JAR archive reader that provides methods to extract all files or access individual entries.
 *
 * @param archivePath - Path to the ZIP or JAR file.
 * @returns An object with methods to extract all files, retrieve a specific entry, read entry contents as a buffer or text, and extract individual entries.
 *
 * @example
 * const zip = createZipReader('archive.zip');
 * const entry = zip.getEntry('file.txt');
 * if (entry) {
 *   const text = await entry.getText();
 *   await entry.extractTo('output/dir');
 * }
 * await zip.extractAll('output/dir');
 */
export function createZipReader(archivePath: string): ZipReader {
	const buffer = readFileSync(archivePath);
	const entries = getEntriesFromCentralDirectory(buffer);

	return {
		extractAll: (directory, onProgress = () => {}) =>
			extract(buffer, directory, onProgress, entries),
		getEntry: (entryName) => {
			const entry = entries.get(entryName);
			if (!entry) return;

			// Store the entry data, but don't decompress yet
			const originalEntryData = entry;
			// Cache for the decompression promise, initialized lazily
			let decompressedDataPromise: Promise<Buffer> | null = null;

			// Helper function to get or create the decompression promise
			const getDecompressedPromise = (): Promise<Buffer> => {
				if (!decompressedDataPromise) {
					// Decompress only when first needed
					decompressedDataPromise = decompressEntry(originalEntryData);
				}
				return decompressedDataPromise;
			};

			return {
				getBuffer: () => getDecompressedPromise(),
				getText: async (encoding = 'utf8') => {
					const decompressed = await getDecompressedPromise();
					return decompressed.toString(encoding);
				},
				extractTo: async (directory) => {
					const decompressed = await getDecompressedPromise();
					// Use the original entryName for the path
					return writeFile(join(directory, originalEntryData[0]), decompressed);
				},
			};
		},
	};
}

/**
 * Extracts all files from a ZIP or JAR archive to a specified directory.
 *
 * @param archiveBuffer - Buffer containing the ZIP or JAR archive data.
 * @param outputDir - Directory where files will be extracted.
 * @param onProgress - Optional callback invoked with the number of files extracted and the total number of entries.
 * @param preParsedEntries - Optional map of entries already parsed from the central directory.
 *
 * @returns A promise that resolves when extraction is complete.
 */
export async function extract(
	archiveBuffer: Buffer | string,
	outputDir: string,
	onProgress: ZipProgressCallback = () => {},
	preParsedEntries?: Map<string, ZipEntry>
): Promise<void> {
	const buffer = Buffer.isBuffer(archiveBuffer)
		? archiveBuffer
		: readFileSync(archiveBuffer);
	const entries = preParsedEntries ?? getEntriesFromCentralDirectory(buffer);
	const createdDirs = new Set<string>();
	const entryIterator = entries.values();
	const activePromises: Promise<void>[] = [];
	let iteratorResult = entryIterator.next();
	let current = 0;

	// Function to process a single entry
	const processEntry = async (entry: ZipEntry): Promise<void> => {
		try {
			await extractEntry(entry, outputDir, createdDirs);
		} catch (err) {
			// Log error for the specific entry but allow others to continue
			console.error(
				`Error extracting entry "${entry[0]}": ${getErrorMessage(err)}`
			);
		} finally {
			// Update progress regardless of success/failure of individual file
			current++;
			onProgress(current, entries.size);
		}
	};

	onProgress(0, entries.size);

	// Loop to manage concurrency
	while (true) {
		// Fill the pool up to the concurrency limit as long as there are entries
		while (activePromises.length < CONCURRENCY_LIMIT && !iteratorResult.done) {
			const entry = iteratorResult.value;
			const promise = processEntry(entry).then(() => {
				// When a promise finishes, remove it from the active pool
				const index = activePromises.indexOf(promise);
				if (index > -1) {
					activePromises.splice(index, 1);
				}
			});
			activePromises.push(promise);
			iteratorResult = entryIterator.next(); // Get the next entry *after* processing the current one
		}

		// If there are no more entries to queue and the pool is empty, we're done
		if (iteratorResult.done && activePromises.length === 0) {
			break; // Exit the main loop
		}

		// Wait for at least one promise in the pool to settle
		// If race rejects, the error will propagate out of 'extract' automatically
		if (activePromises.length > 0) {
			await Promise.race(activePromises);
		} else if (iteratorResult.done) {
			// Should have already broken the loop, but double-check
			break;
		}
	}
}

/**
 * Decompresses a ZIP entry buffer using the specified compression method.
 *
 * @param entry - The ZIP entry tuple containing the compression type and raw data.
 * @returns A promise that resolves to the decompressed buffer.
 *
 * @throws {Error} If the compression method is unsupported.
 * @throws {Error} If decompression fails or results in an empty buffer.
 */
function decompressEntry([
	,
	compressionType,
	rawData,
]: ZipEntry): Promise<Buffer> {
	switch (compressionType) {
		case STORE:
			// Ensure rawData is not empty for STORE entries if size was 0
			return Promise.resolve(rawData ?? Buffer.alloc(0));

		case DEFLATE: {
			// Handle potentially zero-byte compressed data for DEFLATE (e.g., empty file)
			if (rawData.length === 0) {
				return Promise.resolve(Buffer.alloc(0));
			}
			return new Promise((resolve, reject) => {
				inflateRaw(rawData, (error, decompressed) => {
					if (error) {
						reject(new Error(`Decompression failed: ${error.message}`));
						return;
					}
					// Decompression might legitimately result in an empty buffer if original was empty
					resolve(decompressed ?? Buffer.alloc(0));
				});
			});
		}

		default:
			return Promise.reject(
				new Error(`Unsupported compression method: ${compressionType}`)
			);
	}
}

/**
 * Extracts a single ZIP entry to the specified output directory.
 *
 * Skips extraction if the entry represents a directory. Ensures the parent directory exists before writing the decompressed file.
 *
 * @param outputDir - The directory where the entry will be extracted.
 * @param createdDirs - An optional set used to track and avoid redundant directory creation.
 *
 * @returns A promise that resolves when the entry has been extracted.
 */
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
		try {
			await mkdir(parentDir, { recursive: true });
			createdDirs?.add(parentDir);
		} catch (err) {
			// Handle potential race conditions or permission issues
			// Check if directory exists now (another process might have created it)
			try {
				const stats = await stat(parentDir);
				if (!stats.isDirectory()) {
					throw new Error(
						`Failed to create directory '${parentDir}', and it's not a directory.`
					);
				}
				// If it exists and is a directory, add it to the set
				createdDirs?.add(parentDir);
			} catch {
				// If stat fails, the original error is likely the cause
				throw new Error(
					`Failed to create directory '${parentDir}': ${getErrorMessage(err)}`
				);
			}
		}
	}

	// Decompress data (handles STORE and DEFLATE)
	const decompressedData = await decompressEntry([
		entryName,
		compressionType,
		rawData,
	]);

	// Write the file
	return writeFile(targetPath, decompressedData);
}

/**
 * Finds the End of Central Directory (EOCD) record offset in the buffer.
 * Searches backwards from the end of the buffer.
 *
 * @param buffer - The buffer containing the ZIP archive data.
 * @returns The offset of the EOCD signature, or -1 if not found.
 */
function findEOCD(buffer: Buffer): number {
	const maxScanLen = Math.min(buffer.length, 65535 + EOCD_MIN_SIZE); // Max comment size + EOCD size
	const startScanOffset = buffer.length - EOCD_MIN_SIZE;

	for (
		let offset = startScanOffset;
		offset >= buffer.length - maxScanLen;
		offset--
	) {
		if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) {
			return offset;
		}
	}
	return -1;
}

/**
 * Parses the ZIP archive buffer using the Central Directory.
 *
 * @param buffer - The buffer containing the ZIP archive data.
 * @returns A map where each key is an entry name and each value is the corresponding {@link ZipEntry}.
 * @throws {Error} If the EOCD record is not found or the archive seems corrupt.
 */
export function getEntriesFromCentralDirectory(
	buffer: Buffer
): Map<string, ZipEntry> {
	const eocdOffset = findEOCD(buffer);
	if (eocdOffset === -1) {
		throw new Error('End of Central Directory record not found.');
	}

	// Read EOCD fields
	const entryCount = buffer.readUInt16LE(eocdOffset + 10); // Use total entries field
	const centralDirSize = buffer.readUInt32LE(eocdOffset + 12); // Corrected: Size is at offset 12
	const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);

	if (centralDirOffset + centralDirSize > eocdOffset) {
		// Basic sanity check
		throw new Error('Central Directory information seems corrupt.');
	}

	const entries: Map<string, ZipEntry> = new Map([]);
	let currentOffset = centralDirOffset;
	const centralDirEnd = centralDirOffset + centralDirSize;

	for (let i = 0; i < entryCount && currentOffset < centralDirEnd; i++) {
		if (buffer.readUInt32LE(currentOffset) !== CENTRAL_DIR_HEADER) {
			console.warn(
				`Expected Central Directory Header not found at offset ${currentOffset}. Skipping remaining entries.`
			);
			break; // Stop parsing if structure is broken
		}

		if (currentOffset + MIN_CDFH_SIZE > centralDirEnd) {
			console.warn(
				`Incomplete Central Directory Header found at offset ${currentOffset}. Stopping parse.`
			);
			break;
		}

		// Parse CDFH
		const compressionType = buffer.readUInt16LE(currentOffset + 10);
		const compressedSize = buffer.readUInt32LE(currentOffset + 20);
		const fileNameLength = buffer.readUInt16LE(currentOffset + 28);
		const extraFieldLength = buffer.readUInt16LE(currentOffset + 30);
		const fileCommentLength = buffer.readUInt16LE(currentOffset + 32);
		const localHeaderOffset = buffer.readUInt32LE(currentOffset + 42);

		const cdfhHeaderEnd = currentOffset + MIN_CDFH_SIZE;
		const fileNameEnd = cdfhHeaderEnd + fileNameLength;
		const extraFieldEnd = fileNameEnd + extraFieldLength;
		const fileCommentEnd = extraFieldEnd + fileCommentLength;

		if (fileCommentEnd > centralDirEnd) {
			console.warn(
				`Central Directory Header lengths exceed directory bounds at offset ${currentOffset}. Stopping parse.`
			);
			break;
		}

		const entryName = buffer.subarray(cdfhHeaderEnd, fileNameEnd).toString();

		// Now, we need the actual data. We use the localHeaderOffset to find the LFH,
		// read its variable parts (filename, extra field) to find where the data starts.
		if (localHeaderOffset + MIN_LOCAL_HEADER_SIZE > buffer.length) {
			console.warn(
				`Local header offset ${localHeaderOffset} for entry "${entryName}" is out of bounds. Skipping.`
			);
			currentOffset = fileCommentEnd; // Move to next CDFH
			continue;
		}

		// Read LFH to find data start offset
		const lfhFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
		const lfhExtraFieldLength = buffer.readUInt16LE(localHeaderOffset + 28);
		const dataStartOffset =
			localHeaderOffset +
			MIN_LOCAL_HEADER_SIZE +
			lfhFileNameLength +
			lfhExtraFieldLength;
		const dataEndOffset = dataStartOffset + compressedSize;

		if (dataEndOffset > buffer.length) {
			console.warn(
				`Calculated data end offset ${dataEndOffset} for entry "${entryName}" is out of bounds. Skipping.`
			);
			currentOffset = fileCommentEnd; // Move to next CDFH
			continue;
		}

		// Extract raw compressed data
		const rawData = buffer.subarray(dataStartOffset, dataEndOffset);

		// Store the entry using the same ZipEntry structure
		entries.set(entryName, [entryName, compressionType, rawData]);

		// Move to the next CDFH entry
		currentOffset = fileCommentEnd;
	}

	if (entries.size !== entryCount) {
		console.warn(
			`Expected ${entryCount} entries based on EOCD, but parsed ${entries.size}. Archive might be truncated or corrupt.`
		);
	}

	return entries;
}

// (() => {
// 	const startTime = Date.now();
// 	// getEntriesFromCentralDirectory(readFileSync('out/forge-1.21.5-55.0.4.jar'));
// 	// getEntries(readFileSync('out/forge-1.21.5-55.0.4.jar'));
// 	// console.log(result.keys());
// 	console.log(`${Date.now() - startTime}ms`);
// })();

// (async () => {
// const startTime = Date.now();
// const buffer = await readFile('out/java21.zip');
// getEntries(buffer);
// await createZipReader('out/java21.zip');
// const result = await createZipReader('out/java21.zip')
// 	.getEntry('install_profile.json')
// 	?.getText();
// console.log(JSON.parse(result!).version);
// const zipper = createZipReader('out/forge-installer.jar');
// await zipper.getEntry('install_profile.json')?.getText();
// await zipper.extractAll('out/forge-installer');
// console.log(`${Date.now() - startTime}ms`);
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
