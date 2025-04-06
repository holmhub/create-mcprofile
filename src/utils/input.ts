import type { Interface } from 'node:readline';

export async function getFromInput(
	query: string,
	rl: Interface,
): Promise<string> {
	return new Promise((resolve) => rl.question(query, resolve));
}
