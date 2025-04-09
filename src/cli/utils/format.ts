interface FormatOptions {
	columns?: number;
	padding?: number;
	header?: string;
}

export function formatInColumns(
	items: string[],
	options: FormatOptions = {}
): string {
	const { columns = 8, padding = 10, header } = options;

	const rows = Math.ceil(items.length / columns);
	let result = '';

	if (header) {
		result += `${header}\n\n`;
	}

	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < columns; col++) {
			const index = col * rows + row;
			if (index < items.length) {
				result += (
					items[index]?.slice(0, padding) ?? ' '.repeat(padding)
				).padEnd(padding, ' ');
			}
		}
		result += '\n';
	}

	return result;
}
