import {
	AutoModel,
	AutoModelForCausalLM,
	AutoProcessor,
	AutoTokenizer,
	env,
	RawImage,
	TextStreamer,
} from "@huggingface/transformers";
import type { ModelConfig } from "./model-registry";

export type ModelStatus =
	| "idle"
	| "downloading"
	| "downloaded"
	| "loading"
	| "ready"
	| "error";

export interface ModelInfo {
	modelId: string | null;
	status: ModelStatus;
	progress: number;
	error: string | null;
}

export interface GenerateOptions {
	thinking?: boolean;
}

env.allowLocalModels = false;
env.useBrowserCache = true;

async function isModelInBrowserCache(modelId: string): Promise<boolean> {
	try {
		const cacheNames = await caches.keys();
		for (const name of cacheNames) {
			if (name.includes("transformers") || name.includes("huggingface")) {
				const cache = await caches.open(name);
				const requests = await cache.keys();
				if (requests.some((req) => req.url.includes(modelId))) {
					return true;
				}
			}
		}
	} catch (err) {
		console.error("Error checking browser cache:", err);
	}
	return false;
}

async function clearModelCache(modelId: string) {
	const cacheKeys = await caches.keys();
	for (const key of cacheKeys) {
		if (key.includes("transformers") || key.includes("huggingface")) {
			const cache = await caches.open(key);
			const requests = await cache.keys();
			for (const req of requests) {
				if (req.url.includes(modelId)) {
					await cache.delete(req);
				}
			}
		}
	}
}

/**
 * Strategy Pattern for Model Modalities
 */
abstract class BasePipeline {
	protected processor: any = null;
	protected model: any = null;
	protected config: ModelConfig;
	protected device: "webgpu" | "wasm";

	constructor(config: ModelConfig, device: "webgpu" | "wasm") {
		this.config = config;
		this.device = device;
	}

	abstract load(
		onProgress: (pct: number, status: ModelStatus) => void,
	): Promise<void>;
	abstract generate(
		messages: { role: string; content: any }[],
		onChunk: (text: string) => void,
		signal: AbortSignal,
		options?: GenerateOptions,
	): Promise<{ text: string; usage: { totalTokens: number } }>;

	dispose() {
		if (this.model) {
			try {
				this.model.dispose();
			} catch {}
			this.model = null;
		}
		this.processor = null;
	}

	protected get progressCallback() {
		return (e: any, onProgress: (pct: number, status: ModelStatus) => void) => {
			if (e.progress !== undefined && e.file) {
				onProgress(Math.round(e.progress), "loading");
			} else if (e.total_progress !== undefined) {
				onProgress(Math.round(e.total_progress * 100), "loading");
			}
		};
	}

	protected async preparePrompt(
		messages: { role: string; content: any }[],
		options?: GenerateOptions,
	) {
		const enableThinking = options?.thinking ?? this.config.thinking.enabled;
		const tagFormat = this.config.thinking.tagFormat ?? "qwen";

		const prompt = this.processor.apply_chat_template(messages, {
			tokenize: false,
			add_generation_prompt: true,
		});

		if (enableThinking) {
			const startTag =
				this.config.thinking.customTags?.start ??
				(tagFormat === "gemma" ? "<|channel>thought\n" : "<think>\n");
			return prompt + startTag;
		}

		return prompt;
	}
}

/**
 * Text-only Pipeline (No preprocessor_config.json check)
 */
class TextPipeline extends BasePipeline {
	async load(onProgress: (pct: number, status: ModelStatus) => void) {
		const cb = (e: any) => this.progressCallback(e, onProgress);

		this.processor = await AutoTokenizer.from_pretrained(this.config.id, {
			progress_callback: cb,
		});

		const dtype = this.config.dtype ?? "q4f16";
		this.model = await AutoModelForCausalLM.from_pretrained(this.config.id, {
			dtype,
			device: this.device,
			progress_callback: cb,
		});
	}

	async generate(
		messages: { role: string; content: any }[],
		onChunk: (text: string) => void,
		signal: AbortSignal,
		options?: GenerateOptions,
	) {
		const enableThinking = options?.thinking ?? this.config.thinking.enabled;
		const prompt = await this.preparePrompt(messages, options);

		const inputs = await this.processor(prompt);
		const streamer = new TextStreamer(this.processor, {
			skip_prompt: true,
			skip_special_tokens: true,
			callback_function: (text: string) => {
				if (signal.aborted) return;
				onChunk(text);
			},
		});

		const sampling = this.config.sampling;
		const params = enableThinking
			? (sampling?.thinking ?? sampling?.nonThinking)
			: sampling?.nonThinking;

		const outputs = await this.model.generate({
			...inputs,
			max_new_tokens: params?.max_new_tokens ?? 8192,
			temperature: params?.temperature ?? 1.0,
			top_p: params?.top_p ?? 1.0,
			top_k: params?.top_k ?? 20,
			min_p: params?.min_p ?? 0.0,
			presence_penalty: params?.presence_penalty ?? 1.5,
			repetition_penalty: params?.repetition_penalty ?? 1.2,
			streamer,
		});

		return {
			text: "", // Streamed via callback
			usage: { totalTokens: outputs[0]?.length ?? 0 },
		};
	}
}

/**
 * Multimodal Pipeline (Uses AutoProcessor)
 */
class MultimodalPipeline extends BasePipeline {
	async load(onProgress: (pct: number, status: ModelStatus) => void) {
		const cb = (e: any) => this.progressCallback(e, onProgress);

		// This WILL look for preprocessor_config.json
		this.processor = await AutoProcessor.from_pretrained(this.config.id, {
			progress_callback: cb,
		});

		const dtype = this.config.dtype ?? "q4f16";
		this.model = await AutoModel.from_pretrained(this.config.id, {
			dtype,
			device: this.device,
			progress_callback: cb,
		});
	}

	async generate(
		messages: { role: string; content: any }[],
		onChunk: (text: string) => void,
		signal: AbortSignal,
		options?: GenerateOptions,
	) {
		const enableThinking = options?.thinking ?? this.config.thinking.enabled;
		const prompt = await this.preparePrompt(messages, options);

		// Extract base64 images from the messages
		const base64Images: string[] = [];
		for (const msg of messages) {
			if (Array.isArray(msg.content)) {
				for (const part of msg.content) {
					if (part.type === "image" && typeof part.image === "string") {
						base64Images.push(part.image);
					}
				}
			}
		}

		let inputs: any;
		if (base64Images.length > 0) {
			// Convert base64 to RawImage
			const rawImages = await Promise.all(
				base64Images.map(async (b64) => {
					// We need to fetch the blob from the data url and load it
					const response = await fetch(b64);
					const blob = await response.blob();
					return await RawImage.fromBlob(blob);
				}),
			);
			inputs = await this.processor(rawImages, prompt);
		} else {
			// If there are no images, bypass the processor's image handling
			// by using the tokenizer directly to avoid "undefined is not iterable" errors.
			inputs = await this.processor.tokenizer(prompt);
		}

		const streamer = new TextStreamer(this.processor.tokenizer, {
			skip_prompt: true,
			skip_special_tokens: true,
			callback_function: (text: string) => {
				if (signal.aborted) return;
				onChunk(text);
			},
		});

		const sampling = this.config.sampling;
		const params = enableThinking
			? (sampling?.thinking ?? sampling?.nonThinking)
			: sampling?.nonThinking;

		const outputs = await this.model.generate({
			...inputs,
			max_new_tokens: params?.max_new_tokens ?? 4096,
			temperature: params?.temperature ?? 0.7,
			streamer,
		});

		return {
			text: "",
			usage: { totalTokens: outputs[0]?.length ?? 0 },
		};
	}
}

/**
 * Main LocalLLM Coordinator
 */
class LocalLLM {
	private _pipeline: BasePipeline | null = null;
	private _config: ModelConfig | null = null;
	private _status: ModelStatus = "idle";
	private _progress = 0;
	private _error: string | null = null;
	private _device: "webgpu" | "wasm" = "webgpu";
	private listeners: Set<(info: ModelInfo) => void> = new Set();
	private abortController: AbortController | null = null;

	get config() {
		return this._config;
	}
	get status() {
		return this._status;
	}
	get progress() {
		return this._progress;
	}
	get error() {
		return this._error;
	}
	get device() {
		return this._device;
	}
	get isReady() {
		return this._status === "ready" && this._pipeline !== null;
	}

	setDevice(device: "webgpu" | "wasm") {
		this._device = device;
		if (this._pipeline) this.unload();
	}

	setModel(config: ModelConfig) {
		if (this._config?.id !== config.id) {
			this.unload();
			this._config = config;
			this._status = "idle";
			this._progress = 0;
			this.checkCache();
		}
	}

	private setStatus(status: ModelStatus, progress = 0) {
		this._status = status;
		this._progress = progress;
		this.notify();
	}

	private notify() {
		const info = this.getInfo();
		for (const cb of this.listeners) cb(info);
	}

	getInfo(): ModelInfo {
		return {
			modelId: this._config?.id ?? null,
			status: this._status,
			progress: this._progress,
			error: this._error,
		};
	}

	onStatusChange(cb: (info: ModelInfo) => void) {
		this.listeners.add(cb);
		cb(this.getInfo());
		return () => this.listeners.delete(cb);
	}

	async isCached(modelId: string): Promise<boolean> {
		const inCache = await isModelInBrowserCache(modelId);
		if (inCache) return true;
		try {
			// Fast check for tokenizer only to see if basic files exist
			await AutoTokenizer.from_pretrained(modelId, { local_files_only: true });
			return true;
		} catch {
			return false;
		}
	}

	async getCachedModelIds(availableModelIds: string[]): Promise<Set<string>> {
		const cachedIds = new Set<string>();
		try {
			const cacheNames = await caches.keys();
			const allUrls: string[] = [];
			for (const name of cacheNames) {
				if (name.includes("transformers") || name.includes("huggingface")) {
					const cache = await caches.open(name);
					const requests = await cache.keys();
					for (const req of requests) {
						allUrls.push(req.url);
					}
				}
			}

			for (const id of availableModelIds) {
				if (allUrls.some((url) => url.includes(id))) {
					cachedIds.add(id);
				}
			}
		} catch (err) {
			console.error("Error checking browser cache:", err);
		}
		return cachedIds;
	}

	async checkCache() {
		if (!this._config) return;
		const cached = await this.isCached(this._config.id);
		if (cached && this._status === "idle") {
			this.setStatus("downloaded", 100);
		}
	}

	async download(onProgress?: (p: number) => void) {
		await this.load(onProgress);
		// For downloading, we free memory immediately after cache is warm
		this.unload();
		this.setStatus("downloaded", 100);
	}

	async load(onProgress?: (p: number) => void) {
		if (!this._config) return;
		if (this.isReady) return;

		this._error = null;
		this.setStatus("loading", 0);

		try {
			// Dispose previous pipeline
			if (this._pipeline) this._pipeline.dispose();

			// Create new strategy
			this._pipeline =
				this._config.modality === "multimodal"
					? new MultimodalPipeline(this._config, this._device)
					: new TextPipeline(this._config, this._device);

			await this._pipeline.load((pct, status) => {
				this._progress = pct;
				this._status = status;
				onProgress?.(pct);
				this.notify();
			});

			this.setStatus("ready", 100);
		} catch (err) {
			this._error = (err as Error).message;
			this.setStatus("error", 0);
			throw err;
		}
	}

	unload() {
		this.abortController?.abort();
		if (this._pipeline) {
			this._pipeline.dispose();
			this._pipeline = null;
		}
		this._status = "idle";
		this._progress = 0;
		this.checkCache();
		this.notify();
	}

	async generate(
		messages: { role: string; content: any }[],
		onChunk: (text: string) => void,
		signal: AbortSignal,
		options?: GenerateOptions,
	) {
		if (!this._pipeline || !this.isReady) throw new Error("Model not ready");
		this.abortController = new AbortController();

		const combinedSignal = signal ? signal : this.abortController.signal;

		try {
			return await this._pipeline.generate(
				messages,
				onChunk,
				combinedSignal,
				options,
			);
		} finally {
			this.abortController = null;
		}
	}

	stop() {
		this.abortController?.abort();
	}

	async delete() {
		const id = this._config?.id;
		this.unload();
		if (id) await clearModelCache(id);
		this.setStatus("idle", 0);
	}
}

export const localLLM = new LocalLLM();
