import { existsSync } from 'node:fs';
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
			!(
				Array.isArray(mapData.sources) &&
				Array.isArray(mapData.sourcesContent) &&
				mapData.sources.length === mapData.sourcesContent.length
			)
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

		// --- Identify top-level directories and calculate totals ---
		const directoryTotals: Record<string, number> = {};
		const topLevelDirs = new Set<string>();
		for (const info of sourceSizes) {
			const normalizedPath = info.path.split(/[/\\]/).join(sep);
			const firstSeparatorIndex = normalizedPath.indexOf(sep);
			let dirName = '[root]';
			if (firstSeparatorIndex !== -1) {
				dirName = info.path.substring(0, firstSeparatorIndex);
			}
			topLevelDirs.add(dirName);
			directoryTotals[dirName] = (directoryTotals[dirName] || 0) + info.size;
		}

		console.log('Original Source File Sizes (Approximation):');
		console.log('-------------------------------------------');
		for (const info of sourceSizes) {
			console.log(
				`${(info.size / 1024).toFixed(2).padStart(7)} KB - ${info.path}`
			);
		}

		console.log('-------------------------------------------');
		console.log('Totals by Top-Level Directory:');
		console.log('-------------------------------------------');
		const sortedDirs = Array.from(topLevelDirs).sort();
		let grandTotal = 0;
		for (const dirName of sortedDirs) {
			const totalSize = directoryTotals[dirName] || 0;
			grandTotal += totalSize;
			console.log(
				`${(totalSize / 1024).toFixed(2).padStart(7)} KB - ${dirName}${sep}`
			);
		}
		console.log('-------------------------------------------');
		console.log(`${(grandTotal / 1024).toFixed(2).padStart(7)} KB - TOTAL`);
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

const resolvedPath = resolve(mapFilePath);
if (!existsSync(resolvedPath)) {
	console.error(`Error: File not found: ${resolvedPath}`);
	process.exit(1);
}

analyzeMap(resolvedPath);
