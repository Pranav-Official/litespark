import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "./schema";

async function createClient() {
	const [wasmRes, dataRes] = await Promise.all([
		fetch("/pglite.wasm"),
		fetch("/pglite.data"),
	]);

	const [wasmBuffer, dataBlob] = await Promise.all([
		wasmRes.arrayBuffer(),
		dataRes.blob(),
	]);

	const wasmModule = await WebAssembly.compile(wasmBuffer);

	const isInitialized = localStorage.getItem("pglite_initialized_litespark");

	const client = new PGlite("idb://litespark", {
		wasmModule,
		fsBundle: isInitialized ? undefined : dataBlob,
	});

	if (!isInitialized) {
		await client.waitReady;
		localStorage.setItem("pglite_initialized_litespark", "true");
	}

	return client;
}

let clientPromise: ReturnType<typeof createClient> | null = null;

export async function getClient() {
	if (!clientPromise) {
		clientPromise = createClient();
	}
	return clientPromise;
}

export const db = drizzle({
	client: await getClient(),
	schema,
});

export async function initDb() {
	await db.execute(`
    CREATE TABLE IF NOT EXISTS chats (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New Chat',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
	await db.execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      chat_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      thinking TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

	// Migration: add thinking column if it doesn't exist
	try {
		await db.execute(`ALTER TABLE messages ADD COLUMN thinking TEXT;`);
	} catch (e) {
		// Ignore if column already exists
	}
	await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}
