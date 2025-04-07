import { EventEmitter } from 'node:events';
import { init } from './core/launch.ts';
import type { ILauncherOptions } from './types.ts';

export const client = new EventEmitter();

export function launch(options: ILauncherOptions): EventEmitter {
	init(options);
	return client;
}
