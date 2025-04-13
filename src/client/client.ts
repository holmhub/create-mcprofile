import type { EventEmitter } from 'node:events';
import { client } from './constants.ts';
import { init } from './core/launch.ts';
import type { ILauncherOptions } from './types.ts';

export function launch(options: ILauncherOptions): EventEmitter {
	init(options);
	return client;
}
