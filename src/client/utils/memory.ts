import { client } from '../constants.ts';
import type { ILauncherOptions } from '../types.ts';

const DEFAULT_MEMORY = {
	min: 1024,
	max: 2048,
} as const;

const MEMORY_REGEX = /^(\d+)(M|G)?$/i;

/**
 * Converts memory string or number to megabytes
 * @throws {Error} If memory format is invalid
 */
function parseMemoryToMB(value: string | number): number {
	if (typeof value === 'number') return value;

	const match = value.match(MEMORY_REGEX);
	if (!match) {
		client.emit('debug', `Invalid memory format: ${value}, using 1GB`);
		return DEFAULT_MEMORY.max;
	}

	const [, amount, unit] = match;
	const numericValue = Number.parseInt(amount || '', 10);

	return unit?.toUpperCase() === 'G' ? numericValue * 1024 : numericValue;
}

/**
 * Gets formatted memory values for JVM arguments
 * @returns Tuple of [maxMemory, minMemory] in the format "1024M"
 */
export function getMemory(options: ILauncherOptions): [string, string] {
	if (!options.memory) {
		client.emit('debug', 'Memory not set! Using default values.');
		options.memory = DEFAULT_MEMORY;
	}

	const maxMem = parseMemoryToMB(options.memory.max);
	const minMem = parseMemoryToMB(options.memory.min);

	if (minMem > maxMem) {
		client.emit(
			'debug',
			'MIN memory is higher than MAX! Using default values.'
		);
		return [`${DEFAULT_MEMORY.max}M`, `${DEFAULT_MEMORY.min}M`];
	}

	return [`${maxMem}M`, `${minMem}M`];
}
