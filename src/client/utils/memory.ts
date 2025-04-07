import { client } from '../index.ts';
import type { ILauncherOptions } from '../types.ts';

export function getMemory(options: ILauncherOptions) {
	if (!options.memory) {
		client.emit('debug', 'Memory not set! Setting 1GB as MAX!');
		options.memory = {
			min: 512,
			max: 1023,
		};
	}

	// Parse memory values and convert to megabytes
	const parseMemory = (value: string | number): number => {
		if (typeof value === 'number') return value;
		const match = value.match(/^(\d+)(M|G)?$/i);
		if (!match) return 1024; // Default to 1GB if invalid format

		const [, num, unit] = match;
		return unit?.toUpperCase() === 'G'
			? Number.parseInt(String(num)) * 1024
			: Number.parseInt(String(num));
	};

	const maxMem = parseMemory(options.memory.max);
	const minMem = parseMemory(options.memory.min);

	// Ensure min is not greater than max
	if (minMem > maxMem) {
		client.emit('debug', 'MIN memory is higher than MAX! Resetting!');
		return ['1024M', '512M'];
	}

	return [`${maxMem}M`, `${minMem}M`];
}
