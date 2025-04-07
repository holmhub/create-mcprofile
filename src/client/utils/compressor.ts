import {
	createReadStream,
	createWriteStream,
	existsSync,
	mkdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { client } from '../index.ts';

export async function unzipFile(
	inputPath: string,
	outputPath: string,
): Promise<void> {
	try {
		if (!existsSync(inputPath)) {
			client.emit('debug', `Input file does not exist: ${inputPath}`);
			return;
		}

		mkdirSync(outputPath, { recursive: true });

		const input = createReadStream(inputPath);
		let currentBuffer = Buffer.alloc(0);

		const transform = new Transform({
			transform(chunk, _encoding, callback) {
				try {
					currentBuffer = Buffer.concat([currentBuffer, chunk]);

					while (currentBuffer.length >= 4) {
						const headerIndex = currentBuffer.indexOf(
							Buffer.from([0x50, 0x4b, 0x03, 0x04]),
						);
						if (headerIndex === -1) break;

						if (currentBuffer.length >= headerIndex + 30) {
							const compressionMethod = currentBuffer.readUInt16LE(
								headerIndex + 8,
							);
							const compressedSize = currentBuffer.readUInt32LE(
								headerIndex + 18,
							);
							currentBuffer.readUInt32LE(headerIndex + 22);
							const nameLength = currentBuffer.readUInt16LE(headerIndex + 26);
							const extraLength = currentBuffer.readUInt16LE(headerIndex + 28);

							const headerSize = headerIndex + 30 + nameLength + extraLength;
							if (currentBuffer.length < headerSize + compressedSize) break;

							const fileName = currentBuffer
								.slice(headerIndex + 30, headerIndex + 30 + nameLength)
								.toString();
							const compressedData = currentBuffer.slice(
								headerSize,
								headerSize + compressedSize,
							);

							if (!fileName.endsWith('/')) {
								const entryPath = join(outputPath, fileName);
								const entryDir = join(
									outputPath,
									fileName.split('/').slice(0, -1).join('/'),
								);
								mkdirSync(entryDir, { recursive: true });

								const writer = createWriteStream(entryPath);
								if (compressionMethod === 0) {
									// Stored (no compression)
									writer.write(compressedData);
								} else if (compressionMethod === 8) {
									// Deflate compression
									const inflated =
										require('node:zlib').inflateRawSync(compressedData);
									writer.write(inflated);
								}
								writer.end();
							}

							currentBuffer = currentBuffer.slice(headerSize + compressedSize);
						} else {
							break;
						}
					}
					callback();
				} catch (error) {
					callback(error as Error);
				}
			},
		});

		await pipeline(input, transform);
	} catch (error) {
		client.emit('debug', `Failed to unzip file: ${error}`);
		throw error;
	}
}
