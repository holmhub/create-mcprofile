import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

interface ProfileData {
	game_version: string | null;
	mod_loader: string | null;
	mod_loader_version: string | null;
	override_mc_memory_max: string | null;
	icon_path: string | null;
}

export function getModrinthProfile(
	profilesDirectory: string,
	profileName: string
): ProfileData | null {
	const dbPath = resolve(`${profilesDirectory}/../app.db`);
	if (!existsSync(dbPath)) return null;

	const db = new Database(dbPath);
	try {
		const data = db
			.prepare(`
            SELECT 
                game_version,
                mod_loader,
                mod_loader_version,
                override_mc_memory_max,
                icon_path 
            FROM profiles 
            WHERE path=? LIMIT 1`)
			.get(profileName) as ProfileData | undefined;

		return data ?? null;
	} catch {
		return null;
	} finally {
		db.close();
	}
}
