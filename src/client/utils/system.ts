import { exec, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
	copyFileSync,
	createReadStream,
	createWriteStream,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	unlinkSync,
	writeFile,
	writeFileSync,
} from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { createUnzip } from 'node:zlib';
import { randomUUIDv7 } from 'bun';
import type {
	IArtifact,
	ILauncherOptions,
	ILibrary,
	IUser,
	IVersionManifest,
} from '../types';

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
