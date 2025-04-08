import type { ILibrary } from '../types.ts';

const OS_MAP = {
	win32: 'windows',
	darwin: 'osx',
	linux: 'linux',
} as const;

type SupportedOS = (typeof OS_MAP)[keyof typeof OS_MAP];

/**
 * Gets the current operating system name in Minecraft format
 */
export function getOS(): SupportedOS {
	return OS_MAP[process.platform as keyof typeof OS_MAP] || 'linux';
}

/**
 * Determines if a library should be excluded based on its rules
 * @returns true if library should be excluded, false if it should be included
 */
export function parseRule(lib: ILibrary): boolean {
	if (!lib.rules || lib.rules.length === 0) return false;

	let allowed = false;
	const currentOS = getOS();

	for (const rule of lib.rules) {
		if (!rule.os) {
			allowed = rule.action === 'allow';
			continue;
		}

		if (rule.os.name === currentOS) {
			allowed = rule.action === 'allow';
			break; // OS-specific rule found, no need to check further
		}
	}

	return !allowed;
}
