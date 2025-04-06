import { randomUUIDv7 } from 'bun';
import type { IUser } from './types';

export function getAuth(username: string): IUser {
	const uuid = randomUUIDv7();

	return {
		access_token: uuid,
		client_token: uuid,
		uuid,
		name: username,
		user_properties: '{}',
	};
}
