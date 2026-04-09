import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { runMigrations } from "./migrations";
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
let migrationPromise: Promise<void> | null = null;

export async function getClient() {
	if (!clientPromise) {
		clientPromise = createClient();
	}
	const client = await clientPromise;

	if (!migrationPromise) {
		migrationPromise = runMigrations(client);
	}
	await migrationPromise;

	return client;
}

export const db = drizzle({
	client: await getClient(),
	schema,
});

export async function initDb() {
	// Migrations are now handled in getClient() automatically
	await getClient();
}
