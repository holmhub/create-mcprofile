import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

interface ProfileData {
	game_version: string | null;
	mod_loader: string | null;
	mod_loader_version: string | null;
	override_mc_memory_max: string | null;
	icon_path: string | null;
}

// Dynamic import based on runtime
const getDatabase = async () => {
	if (process.versions.bun) {
		const { Database } = await import('bun:sqlite');
		return Database;
	}

	const { DatabaseSync } = await import('node:sqlite');
	return DatabaseSync;
};

export async function getModrinthProfile(
	profilesDirectory: string,
	profileName: string
): Promise<ProfileData | null> {
	const dbPath = resolve(`${profilesDirectory}/../app.db`);
	if (!existsSync(dbPath)) return null;

	try {
		const DB = await getDatabase();
		const db = new DB(dbPath);

		const stmt = db.prepare(`
            SELECT 
                game_version,
                mod_loader,
                mod_loader_version,
                override_mc_memory_max,
                icon_path 
            FROM profiles 
            WHERE path = ?`);

		const data = stmt.get(profileName) as ProfileData | undefined;
		db.close();
		return data ?? null;
	} catch {
		return null;
	}
}
