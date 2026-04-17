import type { ModelConfig } from "../model-registry";

// ---------------------------------------------------------------------------
// Content part types
// ---------------------------------------------------------------------------

export interface ContentPartText {
	type: "text";
	text: string;
}

export interface ContentPartImage {
	type: "image";
	/** Base64 data-URL or object URL for the image */
	image: string;
}

export type ContentPart = ContentPartText | ContentPartImage;

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

export interface Message {
	role: string;
	content: string | ContentPart[];
}

// ---------------------------------------------------------------------------
// Adapter types
// ---------------------------------------------------------------------------

export type ModelStatus =
	| "idle"
	| "downloading"
	| "downloaded"
	| "loading"
	| "ready"
	| "error";

export interface GenerateOptions {
	thinking?: boolean;
}

export interface IModelAdapter {
	/** Loads the model, processor, and tokenizer into WebGPU memory */
	load(
		config: ModelConfig,
		device: "webgpu" | "wasm",
		onProgress: (
			pct: number,
			status: ModelStatus,
			downloads: Record<string, number>,
		) => void,
	): Promise<void>;

	/** Formats the messages into the exact tensor inputs the model expects. */
	prepareInputs(messages: Message[], options?: GenerateOptions): Promise<any>;

	/** Streams the generation back to the UI */
	generate(
		inputs: any,
		onChunk: (text: string) => void,
		signal: AbortSignal,
		options?: GenerateOptions,
	): Promise<{ text: string; usage: { totalTokens: number } }>;

	/** Clears memory */
	dispose(): void;
}
