import { getErrorMessage } from '@/client/utils/other';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function iniParse<T>(iniString: string): T {
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	const result: any = {};
	let currentSection = result;

	const lines = iniString.split(/\r?\n/);

	for (const line of lines) {
		const trimmedLine = line.trim();

		// Skip empty lines and comments
		if (
			!trimmedLine ||
			trimmedLine.startsWith(';') ||
			trimmedLine.startsWith('#')
		) {
			continue;
		}

		// Check for section
		if (trimmedLine.startsWith('[') && trimmedLine.endsWith(']')) {
			const sectionName = trimmedLine.slice(1, -1);
			result[sectionName] = {};
			currentSection = result[sectionName];
			continue;
		}

		// Handle key-value pairs
		const separatorIndex = trimmedLine.indexOf('=');
		if (separatorIndex !== -1) {
			const key = trimmedLine.slice(0, separatorIndex).trim();
			const value = trimmedLine.slice(separatorIndex + 1).trim();

			// Convert value types
			if (value.toLowerCase() === 'true') currentSection[key] = true;
			else if (value.toLowerCase() === 'false') currentSection[key] = false;
			else if (!Number.isNaN(Number(value)))
				currentSection[key] = Number(value);
			else if (value.includes(','))
				currentSection[key] = value.split(',').map((v) => v.trim());
			else currentSection[key] = value;
		}
	}

	return result as T;
}

export function readIniFile<T>(filePath: string): T {
	try {
		const content = readFileSync(filePath, 'utf-8');
		return iniParse<T>(content);
	} catch (error) {
		throw new Error(`Failed to read INI file: ${getErrorMessage(error)}`);
	}
}

export function saveIniFile<T extends object>(data: T, filePath: string): void {
	try {
		let output = '';

		for (const [key, value] of Object.entries(data)) {
			if (
				typeof value === 'object' &&
				value !== null &&
				!Array.isArray(value)
			) {
				// Handle sections
				output += `[${key}]\n`;
				for (const [subKey, subValue] of Object.entries(value)) {
					const formattedValue = Array.isArray(subValue)
						? subValue.join(',')
						: String(subValue);
					output += `${subKey}=${formattedValue}\n`;
				}
				output += '\n';
			} else {
				// Handle root level key-value pairs
				const formattedValue = Array.isArray(value)
					? value.join(',')
					: String(value);
				output += `${key}=${formattedValue}\n`;
			}
		}

		mkdirSync(dirname(filePath), { recursive: true });
		writeFileSync(filePath, output, 'utf-8');
	} catch (error) {
		throw new Error(`Failed to save INI file: ${getErrorMessage(error)}`);
	}
}
