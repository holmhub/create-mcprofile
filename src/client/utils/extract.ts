import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { inflateRawSync } from 'node:zlib';

type ZipEntry = [
	fileName: string,
	compressionMethod: number,
	compressedData: Buffer,
];

/**
 * Simple archive extractor using only built-in Node.js modules
 * @param archivePath - Path to the ZIP/JAR file
 * @param outputDir - Directory to extract files to
 * @param onProgress - Progress callback
 */
export function extract(
	archivePath: string,
	outputDir: string,
	onProgress: (current: number, total: number) => void = () => {}
) {
	const buffer = readFileSync(archivePath);
	let offset = 0;

	onProgress(offset, buffer.length);

	while (offset < buffer.length) {
		const [entry, nextOffset] = parseEntry(buffer, offset);
		if (entry) {
			extractFile(entry, outputDir);
			onProgress(nextOffset, buffer.length);
		}
		offset = nextOffset;
	}

	onProgress(buffer.length, buffer.length);
}

function parseEntry(buffer: Buffer, offset: number): [ZipEntry | null, number] {
	// Skip if not enough bytes for header (30) or invalid ZIP signature (0x04034b50)
	if (
		offset + 30 > buffer.length ||
		buffer.readUInt32LE(offset) !== 0x04034b50
	) {
		return [null, offset + 1];
	}

	// Parse local file header
	// const version = buffer.readUInt16LE(offset + 4);
	// const bitFlag = buffer.readUInt16LE(offset + 6);
	const compressionMethod = buffer.readUInt16LE(offset + 8);
	// const lastModTime = buffer.readUInt16LE(offset + 10);
	// const lastModDate = buffer.readUInt16LE(offset + 12);
	// const crc32 = buffer.readUInt32LE(offset + 14);
	const compressedSize = buffer.readUInt32LE(offset + 18);
	// const uncompressedSize = buffer.readUInt32LE(offset + 22);
	const fileNameLength = buffer.readUInt16LE(offset + 26);
	const extraFieldLength = buffer.readUInt16LE(offset + 28);

	// Get filename
	const fileName = buffer
		.subarray(offset + 30, offset + 30 + fileNameLength)
		.toString();

	// Calculate data offset
	const dataOffset = offset + 30 + fileNameLength + extraFieldLength;

	// Get file data
	const endOffset = dataOffset + compressedSize;
	const compressedData = buffer.subarray(dataOffset, endOffset);

	return [[fileName, compressionMethod, compressedData], endOffset];
}

function extractFile(
	[fileName, compressionMethod, compressedData]: ZipEntry,
	outputDir: string
): void {
	// Create output file path
	const outputPath = join(outputDir, fileName);

	// Create directories if needed
	if (fileName.endsWith('/')) {
		mkdirSync(outputPath, { recursive: true });
		return;
	}

	// Ensure parent directory exists
	mkdirSync(dirname(outputPath), { recursive: true });

	// Decompress and write file
	let fileData: Buffer<ArrayBufferLike>;
	if (compressionMethod === 0) {
		// No compression (Store)
		fileData = compressedData;
	} else if (compressionMethod === 8) {
		// DEFLATE compression
		fileData = inflateRawSync(compressedData);
	} else {
		console.warn(`Method ${compressionMethod} not supported: ${fileName}`);
		// Skip this file
		return;
	}

	writeFileSync(outputPath, fileData);
}

// async function extractZip(zipFilePath: string, outputDir: string) {
// 	try {
// 		console.log(`Extracting ${zipFilePath} to ${outputDir}`);
// 		extract(zipFilePath, outputDir, (processed, total) => {
// 			const percentage = Math.round((processed / total) * 100);
// 			process.stdout.write(`Extracting... ${percentage}%\r`);
// 		});
// 		return true;
// 	} catch (error) {
// 		console.error('Error extracting ZIP file:', error);
// 		return false;
// 	}
// }

// extractZip('out/jdk8.zip', 'out/jdk8');
