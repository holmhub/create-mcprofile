import { EventEmitter } from 'node:events';
import { init } from './core/launch';
import type { ILauncherOptions } from './types';
export { getAuth } from './auth';

export const client = new EventEmitter();

export function launch(options: ILauncherOptions): EventEmitter {
	init(options);
	return client;
}
