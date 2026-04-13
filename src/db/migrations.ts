import type { PGlite } from "@electric-sql/pglite";

export async function runMigrations(client: PGlite) {
	// 1. Create migrations table if it doesn't exist
	await client.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT NOW()
    )
  `);

	const appliedMigrations = await client.query<{ name: string }>(
		"SELECT name FROM _migrations",
	);
	const appliedSet = new Set(appliedMigrations.rows.map((m) => m.name));

	const migrations = [
		{
			name: "0001_initial_schema",
			up: async (pg: PGlite) => {
				await pg.exec(`
          CREATE TABLE IF NOT EXISTS chats (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL DEFAULT 'New Chat',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `);
				await pg.exec(`
          CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            chat_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            thinking TEXT,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `);
				await pg.exec(`
          CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
          )
        `);
			},
		},
		{
			name: "0002_add_message_metadata",
			up: async (pg: PGlite) => {
				// PGlite/Postgres 16+ supports ADD COLUMN IF NOT EXISTS
				const queries = [
					"ALTER TABLE messages ADD COLUMN IF NOT EXISTS model TEXT;",
					"ALTER TABLE messages ADD COLUMN IF NOT EXISTS total_tokens INTEGER;",
					"ALTER TABLE messages ADD COLUMN IF NOT EXISTS time_taken_ms INTEGER;",
				];
				for (const q of queries) {
					try {
						await pg.exec(q);
					} catch (e) {
						console.warn(`[DB] Migration query notice for "${q}":`, e);
					}
				}
			},
		},
	];

	for (const migration of migrations) {
		if (!appliedSet.has(migration.name)) {
			console.log(`[DB] Applying migration: ${migration.name}`);
			await migration.up(client);
			await client.query("INSERT INTO _migrations (name) VALUES ($1)", [
				migration.name,
			]);
		}
	}
}
