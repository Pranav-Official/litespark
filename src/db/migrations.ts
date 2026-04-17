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
						id: "LiquidAI/LFM2.5-350M-ONNX",
						name: "LFM2.5-350M-ONNX",
						displayName: "LFM2.5-350M-ONNX",
						size: "~0.5 GB",
						description: "LFM · q4 quantized · WebGPU accelerated",
						modelClass: "TextCausal",
						dtype: JSON.stringify("q4"),
						sampling: JSON.stringify({
							thinking: {
								temperature: 1.0,
								top_p: 0.95,
								top_k: 64,
								min_p: 0.0,
								presence_penalty: 0.0,
								repetition_penalty: 1.0,
								max_new_tokens: 4096,
							},
							nonThinking: {
								temperature: 1.0,
								top_p: 0.95,
								top_k: 64,
								min_p: 0.0,
								presence_penalty: 0.0,
								repetition_penalty: 1.0,
								max_new_tokens: 2048,
							},
						}),
						thinking: JSON.stringify({ enabled: true, tagFormat: "qwen" }),
						isDefault: 1,
					},
					{
						id: "onnx-community/Qwen3.5-0.8B-ONNX",
						name: "Qwen3.5-0.8B-ONNX",
						displayName: "Qwen3.5-0.8B-ONNX",
						size: "~1.0 GB",
						description: "Qwen · q4 quantized · WebGPU accelerated",
						modelClass: "VisionSeq",
						dtype: JSON.stringify("q4"),
						sampling: JSON.stringify({
							thinking: {
								temperature: 1.0,
								top_p: 0.95,
								top_k: 64,
								min_p: 0.0,
								presence_penalty: 0.0,
								repetition_penalty: 1.0,
								max_new_tokens: 4096,
							},
							nonThinking: {
								temperature: 1.0,
								top_p: 0.95,
								top_k: 64,
								min_p: 0.0,
								presence_penalty: 0.0,
								repetition_penalty: 1.0,
								max_new_tokens: 2048,
							},
						}),
						thinking: JSON.stringify({ enabled: true, tagFormat: "qwen" }),
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
		{
			name: "0005_add_message_images",
			up: async (pg: PGlite) => {
				await pg.exec(
					"ALTER TABLE messages ADD COLUMN IF NOT EXISTS images TEXT;",
				);
			},
		},
		{
			name: "0006_add_path_map_to_local_models",
			up: async (pg: PGlite) => {
				await pg.exec(
					"ALTER TABLE local_models ADD COLUMN IF NOT EXISTS path_map TEXT;",
				);
				await pg.exec(
					"ALTER TABLE local_models ADD COLUMN IF NOT EXISTS repo_files TEXT;",
				);
				await pg.exec(
					"ALTER TABLE local_models ADD COLUMN IF NOT EXISTS architecture TEXT;",
				);
			},
		},
		{
			name: "0007_add_repo_files_to_local_models",
			up: async (pg: PGlite) => {
				await pg.exec(
					"ALTER TABLE local_models ADD COLUMN IF NOT EXISTS repo_files TEXT;",
				);
			},
		},
		{
			name: "0008_update_model_classes",
			up: async (pg: PGlite) => {
				await pg.exec(
					"UPDATE local_models SET model_class = 'TextCausal' WHERE model_class = 'Qwen3_5';",
				);
				await pg.exec(
					"UPDATE local_models SET model_class = 'VisionSeq' WHERE model_class = 'Gemma4';",
				);
			},
		},
		{
			name: "0009_fix_max_tokens",
			up: async (pg: PGlite) => {
				const models = await pg.query<{ id: string; sampling: string }>(
					"SELECT id, sampling FROM local_models",
				);
				for (const m of models.rows) {
					try {
						const sampling = JSON.parse(m.sampling);
						if (sampling.thinking) sampling.thinking.max_new_tokens = 4096;
						if (sampling.nonThinking)
							sampling.nonThinking.max_new_tokens = 2048;
						await pg.query(
							"UPDATE local_models SET sampling = $1 WHERE id = $2",
							[JSON.stringify(sampling), m.id],
						);
					} catch (e) {
						console.error(`[DB] Failed to update sampling for ${m.id}`, e);
					}
				}
			},
		},
		{
			name: "0010_add_chat_template_to_local_models",
			up: async (pg: PGlite) => {
				await pg.exec(
					"ALTER TABLE local_models ADD COLUMN IF NOT EXISTS chat_template TEXT;",
				);
			},
		},
		{
			name: "0011_add_attachments_to_messages",
			up: async (pg: PGlite) => {
				await pg.exec(
					"ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachments TEXT;",
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
