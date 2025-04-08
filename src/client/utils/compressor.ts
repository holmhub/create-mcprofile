import {
	createReadStream,
	createWriteStream,
	existsSync,
	mkdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { inflateRawSync } from 'node:zlib';
import { client } from '../index.ts';

interface ZipHeader {
	compressionMethod: number;
	compressedSize: number;
	nameLength: number;
	extraLength: number;
	headerSize: number;
	fileName: string;
}

const ZIP_HEADER_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const ZIP_HEADER_SIZE = 30;
const COMPRESSION = {
	STORED: 0,
	DEFLATE: 8,
} as const;

const ERRORS = {
	FILE_NOT_FOUND: (path: string) => `Input file does not exist: ${path}`,
	UNZIP_FAILED: (error: unknown) => `Failed to unzip file: ${error}`,
	INVALID_COMPRESSION: (method: number) =>
		`Unsupported compression method: ${method}`,
};

/**
 * Extracts a ZIP file to the specified directory
 * @throws If file doesn't exist or extraction fails
 */
export async function unzipFile(
	inputPath: string,
	outputPath: string
): Promise<void> {
	if (!existsSync(inputPath)) {
		const error = ERRORS.FILE_NOT_FOUND(inputPath);
		client.emit('debug', error);
		throw new Error(error);
	}

	try {
		mkdirSync(outputPath, { recursive: true });
		await pipeline(createReadStream(inputPath), createZipTransform(outputPath));
	} catch (error) {
		const message = ERRORS.UNZIP_FAILED(error);
		client.emit('debug', message);
		throw new Error(message);
	}
}

function createZipTransform(outputPath: string): Transform {
	let currentBuffer = Buffer.alloc(0);

	return new Transform({
		transform(chunk, _encoding, callback) {
			try {
				currentBuffer = Buffer.concat([currentBuffer, chunk]);
				processZipEntries(currentBuffer, outputPath);
				callback();
			} catch (error) {
				callback(error as Error);
			}
		},
	});
}

function parseZipHeader(buffer: Buffer, headerIndex: number): ZipHeader | null {
	if (buffer.length < headerIndex + ZIP_HEADER_SIZE) return null;

	const nameLength = buffer.readUInt16LE(headerIndex + 26);
	const extraLength = buffer.readUInt16LE(headerIndex + 28);
	const headerSize = headerIndex + ZIP_HEADER_SIZE + nameLength + extraLength;

	return {
		compressionMethod: buffer.readUInt16LE(headerIndex + 8),
		compressedSize: buffer.readUInt32LE(headerIndex + 18),
		nameLength,
		extraLength,
		headerSize,
		fileName: buffer
			.subarray(
				headerIndex + ZIP_HEADER_SIZE,
				headerIndex + ZIP_HEADER_SIZE + nameLength
			)
			.toString(),
	};
}

function processZipEntries(buffer: Buffer, outputPath: string): void {
	let currentPosition = 0;

	while (buffer.length - currentPosition >= ZIP_HEADER_SIZE) {
		const headerIndex = buffer.indexOf(ZIP_HEADER_MAGIC, currentPosition);
		if (headerIndex === -1) break;

		const header = parseZipHeader(buffer, headerIndex);
		if (!header || buffer.length < header.headerSize + header.compressedSize) {
			break;
		}

		if (!header.fileName.endsWith('/')) {
			extractZipEntry(
				buffer.subarray(
					header.headerSize,
					header.headerSize + header.compressedSize
				),
				header,
				outputPath
			);
		}

		currentPosition = header.headerSize + header.compressedSize;
	}
}

function extractZipEntry(
	compressedData: Buffer,
	header: ZipHeader,
	outputPath: string
): void {
	const entryPath = join(outputPath, header.fileName);
	const entryDir = join(
		outputPath,
		header.fileName.split('/').slice(0, -1).join('/')
	);

	mkdirSync(entryDir, { recursive: true });
	const writer = createWriteStream(entryPath);

	switch (header.compressionMethod) {
		case COMPRESSION.STORED:
			writer.write(compressedData);
			break;
		case COMPRESSION.DEFLATE:
			writer.write(inflateRawSync(compressedData));
			break;
		default:
			throw new Error(ERRORS.INVALID_COMPRESSION(header.compressionMethod));
	}

	writer.end();
}

// (async () => {
// 	const { rmSync } = await import('node:fs');
// 	rmSync('out/natives', { recursive: true, force: true });
// 	client.on('debug', console.log);
// 	client.on('data', console.log);
// 	const { handleProgress } = await import('@/utils/progress.ts');
// 	client.on('progress', handleProgress);
// 	const { initializeLauncherOptions } = await import('@/client/core/launch.ts');
// 	const options = initializeLauncherOptions({
// 		root: 'out',
// 		version: { number: '1.7.5' },
// 	});
// 	const { getVersionManifest } = await import('@/client/handlers/version.ts');
// 	const manifest = await getVersionManifest(options);
// 	const { getNatives } = await import('@/client/handlers/natives.ts');
// 	getNatives(options, manifest);
// })();
