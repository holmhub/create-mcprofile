import { emitKeypressEvents } from 'node:readline';

export async function selectFromList(
	items: string[],
	title: string
): Promise<number> {
	if (!Array.isArray(items)) {
		throw new Error('Items must be an array');
	}

	return new Promise((resolve) => {
		let selectedIndex = 0;
		let lastLines = 0;

		// Enable keypress events
		emitKeypressEvents(process.stdin);
		if (process.stdin.isTTY) {
			process.stdin.setRawMode(true);
		}

		const clearLastRender = () => {
			if (lastLines > 0) {
				process.stdout.moveCursor(0, -lastLines);
				process.stdout.clearScreenDown();
			}
		};

		const render = () => {
			clearLastRender();
			const lines = [`${title}:`];
			items.forEach((item, index) => {
				const prefix = index === selectedIndex ? '●' : '○';
				lines.push(`  ${prefix} ${item}`);
			});
			process.stdout.write(`${lines.join('\n')}\n`);
			lastLines = lines.length;
		};

		// First render needs an extra newline to separate from previous output
		console.log('');
		render();

		const keypressHandler = (
			_: string,
			key: { name: string; ctrl: boolean }
		) => {
			if (key.name === 'up' && selectedIndex > 0) {
				selectedIndex--;
				render();
			} else if (key.name === 'down' && selectedIndex < items.length - 1) {
				selectedIndex++;
				render();
			} else if (key.name === 'return') {
				cleanup();
				resolve(selectedIndex);
			} else if (key.name === 'c' && key.ctrl) {
				cleanup();
				process.exit(0);
			}
		};

		const cleanup = () => {
			process.stdin.removeListener('keypress', keypressHandler);
			if (process.stdin.isTTY) {
				process.stdin.setRawMode(false);
			}
			clearLastRender();
			process.stdout.moveCursor(0, -1);
			process.stdout.write(`${title}: ${items[selectedIndex]}\n`);
		};

		process.stdin.on('keypress', keypressHandler);
	});
}
