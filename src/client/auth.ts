import { randomUUID } from 'node:crypto';
import type { IUser } from './types';

export function getAuth(username: string): IUser {
	const uuid = randomUUID();

	return {
		access_token: uuid,
		client_token: uuid,
		uuid,
		name: username,
		user_properties: '{}',
	};
}
