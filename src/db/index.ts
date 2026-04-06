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

	return new PGlite("idb://litespark", {
		wasmModule,
		fsBundle: dataBlob,
	});
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
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
	await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}
