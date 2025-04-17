import { readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

interface SourceMapData {
	version: number;
	sources: string[];
	sourcesContent?: (string | null)[]; // sourcesContent is optional and can contain nulls
	mappings: string;
}

interface SourceSizeInfo {
	path: string;
	size: number;
}

async function analyzeMap(mapPath: string): Promise<void> {
	try {
		const mapContent = await readFile(mapPath, 'utf-8');
		const mapData: SourceMapData = JSON.parse(mapContent);

		// Ensure sourcesContent exists and matches sources length
		if (
			!(mapData.sources && mapData.sourcesContent) ||
			mapData.sources.length !== mapData.sourcesContent.length
		) {
			console.error(
				'Source map must contain a valid "sources" and "sourcesContent" array of matching lengths.'
			);
			process.exit(1);
		}

		const sourceSizes: SourceSizeInfo[] = mapData.sources.map(
			(source, index) => {
				const content = mapData.sourcesContent?.[index];
				const size = content ? Buffer.byteLength(content, 'utf8') : 0;
				const relativePath = relative(
					process.cwd(),
					resolve(dirname(mapPath), source)
				);
				return { path: relativePath, size };
			}
		);

		sourceSizes.sort((a, b) => b.size - a.size);
		const srcTotalSize = sourceSizes
			.filter((info) => info.path.startsWith(`src${sep}`))
			.reduce((sum, info) => sum + info.size, 0);

		const nodeModulesTotalSize = sourceSizes
			.filter((info) => info.path.startsWith(`node_modules${sep}`))
			.reduce((sum, info) => sum + info.size, 0);

		console.log('Original Source File Sizes (Approximation):');
		console.log('-------------------------------------------');
		for (const info of sourceSizes) {
			console.log(
				`${(info.size / 1024).toFixed(2).padStart(7)} KB - ${info.path}`
			);
		}

		console.log('-------------------------------------------');
		console.log(
			`Total size of src files: ${(srcTotalSize / 1024)
				.toFixed(2)
				.padStart(7)} KB`
		);
		console.log(
			`Total size of node_modules files: ${(nodeModulesTotalSize / 1024)
				.toFixed(2)
				.padStart(7)} KB`
		);
	} catch (error: unknown) {
		if (error instanceof Error) {
			console.error(`Error analyzing source map: ${error.message}`);
		} else {
			console.error(`An unknown error occurred: ${String(error)}`);
		}
		process.exit(1);
	}
}

const mapFilePath: string | undefined = process.argv[2];

if (!mapFilePath) {
	console.error(
		'Usage: bun simple-map-analyzer.ts <path/to/your/sourcemap.map>'
	);
	process.exit(1);
}

analyzeMap(resolve(mapFilePath));
