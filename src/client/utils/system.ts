import type { ILibrary } from '../types.ts';

export function getOS() {
	switch (process.platform) {
		case 'win32':
			return 'windows';
		case 'darwin':
			return 'osx';
		default:
			return 'linux';
	}
}

export function parseRule(lib: ILibrary): boolean {
	if (!lib.rules) return false;

	// Default to allow if no rules present
	let allowed = lib.rules.length === 0;

	for (const rule of lib.rules) {
		if (rule.os) {
			// Check if OS matches
			const osMatches = rule.os.name === getOS();

			// If OS matches and action is allow, set allowed to true
			// If OS matches and action is disallow, set allowed to false
			if (osMatches) {
				allowed = rule.action === 'allow';
			}
		} else {
			// No OS specified, apply rule globally
			allowed = rule.action === 'allow';
		}
	}

	return !allowed; // Return true if library should be excluded
}
