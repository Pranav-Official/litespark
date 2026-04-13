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
		{
			name: "0003_add_local_models",
			up: async (pg: PGlite) => {
				await pg.exec(`
          CREATE TABLE IF NOT EXISTS local_models (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            display_name TEXT NOT NULL,
            size TEXT NOT NULL,
            description TEXT NOT NULL,
            model_class TEXT NOT NULL,
            dtype TEXT NOT NULL,
            sampling TEXT NOT NULL,
            thinking TEXT NOT NULL,
            is_default INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `);

				const defaultModels = [
					{
						id: "onnx-community/Qwen3.5-0.8B-ONNX",
						name: "Qwen3.5 0.8B",
						displayName: "Qwen3.5 0.8B",
						size: "~850 MB",
						description: "ONNX q4f16 quantized · WebGPU accelerated",
						modelClass: "Qwen3_5",
						dtype: JSON.stringify({
							embed_tokens: "fp16",
							vision_encoder: "fp16",
							decoder_model_merged: "q4f16",
						}),
						sampling: JSON.stringify({
							thinking: {
								temperature: 1.0,
								top_p: 0.95,
								top_k: 20,
								min_p: 0.0,
								presence_penalty: 1.5,
								repetition_penalty: 1.2,
								max_new_tokens: 32768,
							},
							nonThinking: {
								temperature: 1.0,
								top_p: 1.0,
								top_k: 20,
								min_p: 0.0,
								presence_penalty: 2.0,
								repetition_penalty: 1.2,
								max_new_tokens: 8192,
							},
						}),
						thinking: JSON.stringify({ enabled: true, tagFormat: "qwen" }),
						isDefault: 1,
					},
					{
						id: "onnx-community/Qwen3.5-2B-ONNX",
						name: "Qwen3.5 2B",
						displayName: "Qwen3.5 2B",
						size: "~2.0 GB",
						description: "ONNX q4f16 quantized · WebGPU accelerated",
						modelClass: "Qwen3_5",
						dtype: JSON.stringify({
							embed_tokens: "q4f16",
							vision_encoder: "q4f16",
							decoder_model_merged: "q4f16",
						}),
						sampling: JSON.stringify({
							thinking: {
								temperature: 1.0,
								top_p: 0.95,
								top_k: 20,
								min_p: 0.0,
								presence_penalty: 1.5,
								repetition_penalty: 1.2,
								max_new_tokens: 32768,
							},
							nonThinking: {
								temperature: 1.0,
								top_p: 1.0,
								top_k: 20,
								min_p: 0.0,
								presence_penalty: 2.0,
								repetition_penalty: 1.2,
								max_new_tokens: 8192,
							},
						}),
						thinking: JSON.stringify({ enabled: true, tagFormat: "qwen" }),
						isDefault: 1,
					},
					{
						id: "onnx-community/gemma-4-E2B-it-ONNX",
						name: "Gemma 4 E2B",
						displayName: "Gemma 4 E2B",
						size: "~2.3 GB",
						description:
							"Google DeepMind · q4f16 quantized · WebGPU accelerated",
						modelClass: "Gemma4",
						dtype: JSON.stringify("q4f16"),
						sampling: JSON.stringify({
							thinking: {
								temperature: 1.0,
								top_p: 0.95,
								top_k: 64,
								min_p: 0.0,
								presence_penalty: 0.0,
								repetition_penalty: 1.0,
								max_new_tokens: 32768,
							},
							nonThinking: {
								temperature: 1.0,
								top_p: 0.95,
								top_k: 64,
								min_p: 0.0,
								presence_penalty: 0.0,
								repetition_penalty: 1.0,
								max_new_tokens: 8192,
							},
						}),
						thinking: JSON.stringify({ enabled: true, tagFormat: "gemma" }),
						isDefault: 1,
					},
				];

				for (const m of defaultModels) {
					await pg.query(
						"INSERT INTO local_models (id, name, display_name, size, description, model_class, dtype, sampling, thinking, is_default) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
						[
							m.id,
							m.name,
							m.displayName,
							m.size,
							m.description,
							m.modelClass,
							m.dtype,
							m.sampling,
							m.thinking,
							m.isDefault,
						],
					);
				}
			},
		},
		{
			name: "0004_add_modality_to_local_models",
			up: async (pg: PGlite) => {
				await pg.exec(
					"ALTER TABLE local_models ADD COLUMN IF NOT EXISTS modality TEXT NOT NULL DEFAULT 'text';",
				);
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
