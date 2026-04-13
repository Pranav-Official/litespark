import "./patch-fetch";
import {
	AutoModel,
	AutoModelForCausalLM,
	AutoModelForVision2Seq,
	AutoProcessor,
	AutoTokenizer,
	env,
	MultiModalityCausalLM,
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
	downloads?: Record<string, number>;
}

export interface GenerateOptions {
	thinking?: boolean;
}

env.allowLocalModels = false;
env.useBrowserCache = true;

/**
 * Global store for path maps to assist fetch patching
 */
const setGlobalPathMap = (
	modelId: string,
	pathMap?: Record<string, string>,
) => {
	if (!pathMap) return;
	const maps = (window as any).__LITESPARK_PATH_MAPS__ || {};
	maps[modelId] = pathMap;
	(window as any).__LITESPARK_PATH_MAPS__ = maps;
	localStorage.setItem(`path_map_${modelId}`, JSON.stringify(pathMap));
};

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
 * Base Pipeline Class
 */
abstract class BasePipeline {
	protected processor: any = null;
	protected model: any = null;
	protected config: ModelConfig;
	protected device: "webgpu" | "wasm";
	protected downloads: Record<string, number> = {};

	constructor(config: ModelConfig, device: "webgpu" | "wasm") {
		this.config = config;
		this.device = device;
	}

	abstract load(
		onProgress: (
			pct: number,
			status: ModelStatus,
			downloads: Record<string, number>,
		) => void,
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
		return (
			e: any,
			onProgress: (
				pct: number,
				status: ModelStatus,
				downloads: Record<string, number>,
			) => void,
		) => {
			if (e.file && e.progress !== undefined) {
				this.downloads[e.file] = Math.round(e.progress);

				// Calculate overall progress
				const values = Object.values(this.downloads);
				const total = values.reduce((a, b) => a + b, 0);
				const avg = total / values.length;

				onProgress(Math.round(avg), "loading", { ...this.downloads });
			} else if (e.status === "done") {
				if (e.file) this.downloads[e.file] = 100;
				onProgress(100, "loading", { ...this.downloads });
			}
		};
	}

	protected async preparePrompt(
		messages: { role: string; content: any }[],
		options?: GenerateOptions,
	) {
		const enableThinking = options?.thinking ?? this.config.thinking.enabled;
		const tagFormat = this.config.thinking.tagFormat ?? "qwen";

		let formattedMessages = messages;
		if (this.config.modality === "multimodal") {
			formattedMessages = messages.map((msg) => {
				if (typeof msg.content === "string") {
					return { ...msg, content: [{ type: "text", text: msg.content }] };
				}
				return msg;
			});
		}

		const prompt = this.processor.apply_chat_template(formattedMessages, {
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
 * Universal Strategy-Based Pipeline
 */
class UniversalPipeline extends BasePipeline {
	async load(
		onProgress: (
			pct: number,
			status: ModelStatus,
			downloads: Record<string, number>,
		) => void,
	) {
		const cb = (e: any) => this.progressCallback(e, onProgress);

		// 1. Identify optimal model class
		const modelId = this.config.id;
		const arch = this.config.architecture?.toLowerCase() || "";

		// 2. Load Processor/Tokenizer
		try {
			if (this.config.modality === "multimodal") {
				this.processor = await AutoProcessor.from_pretrained(modelId, {
					progress_callback: cb,
				});
			} else {
				this.processor = await AutoTokenizer.from_pretrained(modelId, {
					progress_callback: cb,
				});
			}
		} catch (e) {
			console.warn("[Loader] Failed to load processor, trying fallback", e);
			this.processor = await AutoTokenizer.from_pretrained(modelId, {
				progress_callback: cb,
			});
		}

		// 3. Load Model using Strategy
		const loadOptions = {
			dtype: this.config.dtype,
			device: this.device,
			progress_callback: cb,
		};

		// "Manifest-Guard" loading optimization
		// By checking the pathMap, we avoid speculative loading completely
		// which prevents 404 network spam.
		const hasGenHead = Object.keys(this.config.pathMap || {}).some(
			(k) => k.includes("gen_head") || k.includes("language_model"),
		);

		if (arch.includes("janus") || hasGenHead) {
			console.log("[Loader] Using MultiModalityCausalLM strategy");
			this.model = await MultiModalityCausalLM.from_pretrained(
				modelId,
				loadOptions,
			);
		} else if (this.config.modality === "multimodal") {
			console.log("[Loader] Using AutoModelForVision2Seq strategy");
			try {
				this.model = await AutoModelForVision2Seq.from_pretrained(
					modelId,
					loadOptions,
				);
			} catch (e2) {
				console.warn(
					"[Loader] AutoModelForVision2Seq failed, trying AutoModel",
					e2,
				);
				this.model = await AutoModel.from_pretrained(modelId, loadOptions);
			}
		} else {
			console.log("[Loader] Using AutoModelForCausalLM strategy");
			this.model = await AutoModelForCausalLM.from_pretrained(
				modelId,
				loadOptions,
			);
		}
	}

	async generate(
		messages: { role: string; content: any }[],
		onChunk: (text: string) => void,
		signal: AbortSignal,
		options?: GenerateOptions,
	) {
		const enableThinking = options?.thinking ?? this.config.thinking.enabled;
		const prompt = await this.preparePrompt(messages, options);

		let inputs: any;
		if (this.config.modality === "multimodal") {
			// Extract images
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

			if (base64Images.length > 0) {
				const rawImages = await Promise.all(
					base64Images.map(async (b64) => {
						const response = await fetch(b64);
						const blob = await response.blob();
						return await RawImage.fromBlob(blob);
					}),
				);
				inputs = await this.processor(prompt, rawImages);
			} else {
				const tokenizer = this.processor.tokenizer || this.processor;
				inputs = await tokenizer(prompt);
			}
		} else {
			inputs = await this.processor(prompt);
		}

		const tokenizer = this.processor.tokenizer || this.processor;
		const streamer = new TextStreamer(tokenizer, {
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
			top_p: params?.top_p ?? 1.0,
			top_k: params?.top_k ?? 50,
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
	private _downloads: Record<string, number> = {};
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
			this._downloads = {};

			// Setup path map for fetch remapping
			setGlobalPathMap(config.id, config.pathMap);

			this.checkCache();
		}
	}

	private setStatus(
		status: ModelStatus,
		progress = 0,
		downloads: Record<string, number> = {},
	) {
		this._status = status;
		this._progress = progress;
		this._downloads = downloads;
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
			downloads: this._downloads,
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

			// Always use UniversalPipeline now
			this._pipeline = new UniversalPipeline(this._config, this._device);

			await this._pipeline.load((pct, status, downloads) => {
				this._progress = pct;
				this._status = status;
				this._downloads = downloads;
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
		this._downloads = {};
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
