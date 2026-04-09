import {
	AutoProcessor,
	env,
	Gemma4ForConditionalGeneration,
	Qwen3_5ForConditionalGeneration,
	TextStreamer,
} from "@huggingface/transformers";
import {
	DEFAULT_MODEL_ID,
	getModelConfig,
	type ModelConfig,
} from "./model-registry";

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

const MODEL_CLASSES: Record<string, any> = {
	Qwen3_5: Qwen3_5ForConditionalGeneration,
	Gemma4: Gemma4ForConditionalGeneration,
};

async function isModelInBrowserCache(modelId: string): Promise<boolean> {
	try {
		const cacheNames = await caches.keys();
		for (const name of cacheNames) {
			if (name.includes("transformers") || name.includes("huggingface")) {
				const cache = await caches.open(name);
				const requests = await cache.keys();
				// Check if any request URL contains the modelId as a substring
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

class LocalLLM {
	private processor: any = null;
	private model: any = null;
	private _config: ModelConfig | null = null;
	private _status: ModelStatus = "idle";
	private _progress = 0;
	private _error: string | null = null;
	private abortController: AbortController | null = null;
	private _device: "webgpu" | "wasm" = "webgpu";
	private _downloaded = false;

	get config(): ModelConfig | null {
		return this._config;
	}

	get status(): ModelStatus {
		return this._status;
	}

	get progress(): number {
		return this._progress;
	}

	get error(): string | null {
		return this._error;
	}

	get isReady(): boolean {
		return this._status === "ready" && this.model !== null;
	}

	get isDownloaded(): boolean {
		return this._downloaded || this._status === "downloaded";
	}

	get device(): "webgpu" | "wasm" {
		return this._device;
	}

	setDevice(device: "webgpu" | "wasm") {
		this._device = device;
	}

	setModel(modelId: string) {
		const config = getModelConfig(modelId);
		if (!config) throw new Error(`Unknown model: ${modelId}`);
		if (this._config?.id !== modelId) {
			this._config = config;
			this._downloaded = false;
			this._status = "idle";
			this._progress = 0;
			this.unload();
			this.checkCache();
		}
	}

	private setStatus(status: ModelStatus, progress?: number) {
		this._status = status;
		if (progress !== undefined) this._progress = progress;
		for (const cb of this.listeners) {
			cb(this.getInfo());
		}
	}

	getInfo(): ModelInfo {
		return {
			modelId: this._config?.id ?? null,
			status: this._status,
			progress: this._progress,
			error: this._error,
		};
	}

	private listeners: Set<(info: ModelInfo) => void> = new Set();

	onStatusChange(cb: (info: ModelInfo) => void) {
		this.listeners.add(cb);
		cb(this.getInfo());
		return () => this.listeners.delete(cb);
	}

	private get modelId(): string {
		return this._config?.id ?? DEFAULT_MODEL_ID;
	}

	private get modelClass(): string {
		return this._config?.modelClass ?? "Qwen3_5";
	}

	async isCached(modelId: string): Promise<boolean> {
		// First check manually if any files are in the browser cache
		const inCache = await isModelInBrowserCache(modelId);
		if (inCache) return true;

		try {
			// Fallback: check if we can load the processor locally.
			// This covers cases where transformers.js uses its own internal logic.
			await AutoProcessor.from_pretrained(modelId, {
				local_files_only: true,
			});
			return true;
		} catch (_e) {
			return false;
		}
	}

	async checkCache() {
		if (this._config) {
			const cached = await this.isCached(this._config.id);
			if (cached && this._status === "idle") {
				this._downloaded = true;
				this.setStatus("downloaded");
			}
		}
	}

	async download(onProgress?: (progress: number) => void) {
		if (this._downloaded && (await this.isCached(this.modelId))) {
			this.setStatus("downloaded", 100);
			return;
		}

		this._error = null;
		this._progress = 0;
		this.setStatus("downloading", 0);

		try {
			const progressCallback = (e: any) => {
				if (e.progress !== undefined && e.file) {
					const pct = Math.round(e.progress);
					this._progress = Math.min(pct, 100);
					for (const cb of this.listeners) {
						cb(this.getInfo());
					}
					onProgress?.(this._progress);
				} else if (e.total_progress !== undefined) {
					const pct = Math.round(e.total_progress * 100);
					if (pct > this._progress) {
						this._progress = Math.min(pct, 100);
						for (const cb of this.listeners) {
							cb(this.getInfo());
						}
						onProgress?.(this._progress);
					}
				}
			};

			// Download processor (tokenizer/config) to cache
			this.processor = await AutoProcessor.from_pretrained(this.modelId, {
				progress_callback: progressCallback,
			});

			// Download model weights to cache + load to memory
			const ModelClass =
				MODEL_CLASSES[this.modelClass] ?? Qwen3_5ForConditionalGeneration;
			const dtype = this._config?.dtype ?? "q4f16";

			this.model = await ModelClass.from_pretrained(this.modelId, {
				dtype,
				device: this._device,
				progress_callback: progressCallback,
			});

			// All files are now cached. Free memory immediately.
			this._downloaded = true;
			this.model.dispose();
			this.model = null;
			this.setStatus("downloaded", 100);
		} catch (err) {
			this._error = (err as Error).message;
			this._status = "error";
			for (const cb of this.listeners) {
				cb(this.getInfo());
			}
			throw err;
		}
	}

	async load(onProgress?: (progress: number) => void) {
		if (this.isReady) return;

		const cached = await this.isCached(this.modelId);
		if (!cached) {
			await this.download(onProgress);
		}

		this._error = null;
		this._progress = 0;
		this.setStatus("loading", 0);

		try {
			const progressCallback = (e: any) => {
				if (e.progress !== undefined && e.file) {
					const pct = Math.round(e.progress);
					this._progress = Math.min(pct, 100);
					for (const cb of this.listeners) {
						cb(this.getInfo());
					}
					onProgress?.(this._progress);
				}
			};

			// Reload processor from cache if needed
			if (!this.processor) {
				this.processor = await AutoProcessor.from_pretrained(this.modelId, {
					progress_callback: progressCallback,
				});
			}

			// Load model weights from cache (no network if already cached)
			const ModelClass =
				MODEL_CLASSES[this.modelClass] ?? Qwen3_5ForConditionalGeneration;
			const dtype = this._config?.dtype ?? "q4f16";

			this.model = await ModelClass.from_pretrained(this.modelId, {
				dtype,
				device: this._device,
				progress_callback: progressCallback,
			});

			this.setStatus("ready", 100);
		} catch (err) {
			this._error = (err as Error).message;
			this._status = "error";
			for (const cb of this.listeners) {
				cb(this.getInfo());
			}
			throw err;
		}
	}

	unload() {
		this.abortController?.abort();
		this.abortController = null;

		if (this.model) {
			try {
				this.model.dispose();
			} catch {}
			this.model = null;
		}
		this.processor = null;
		this._status = this._downloaded ? "downloaded" : "idle";
		this._progress = 0;
		this._error = null;
		for (const cb of this.listeners) {
			cb(this.getInfo());
		}
	}

	async generate(
		messages: { role: string; content: string }[],
		onChunk: (text: string) => void,
		signal?: AbortSignal,
		options?: GenerateOptions,
	): Promise<{ text: string; usage: { totalTokens: number } }> {
		if (!this.isReady || !this.processor || !this.model) {
			throw new Error("Model not loaded");
		}

		this.abortController = new AbortController();
		const internalSignal = this.abortController.signal;

		const enableThinking =
			options?.thinking ?? this._config?.thinking.enabled ?? false;

		let promptText: string;

		// Build messages with thinking system prompt
		const thinkingInstruction = "Think deeply step by step.";
		let processedMessages = messages;

		if (enableThinking) {
			const existingSystem = messages.find((m) => m.role === "system");
			const systemContent = existingSystem
				? `${existingSystem.content}\n${thinkingInstruction}`
				: thinkingInstruction;

			if (this.modelClass === "Gemma4") {
				// Gemma 4: prepend <|think|> to system prompt to enable thinking
				const gemmaSystemContent = `<|think|>${systemContent}`;
				const systemMsg = messages.find((m) => m.role === "system");
				if (systemMsg) {
					processedMessages = messages.map((m) =>
						m.role === "system"
							? {
									...m,
									content: `<|think|>${m.content}\n${thinkingInstruction}`,
								}
							: m,
					);
				} else {
					processedMessages = [
						{ role: "system", content: gemmaSystemContent },
						...messages,
					];
				}
			} else {
				// Qwen3.5: add thinking instruction to system prompt
				const systemMsg = messages.find((m) => m.role === "system");
				if (systemMsg) {
					processedMessages = messages.map((m) =>
						m.role === "system"
							? { ...m, content: `<think>${m.content}\n` }
							: m,
					);
				} else {
					processedMessages = [
						{ role: "system", content: "<think>" },
						...messages,
					];
				}
			}
		}

		// Apply chat template
		if (this.modelClass === "Gemma4") {
			promptText = this.processor.apply_chat_template(processedMessages, {
				add_generation_prompt: true,
				enable_thinking: enableThinking,
			});
		} else {
			// For Qwen3.5, try enable_thinking directly or via chat_template_kwargs, then fallback
			try {
				promptText = this.processor.apply_chat_template(processedMessages, {
					add_generation_prompt: true,
					enable_thinking: enableThinking,
					chat_template_kwargs: { enable_thinking: enableThinking },
				});
			} catch {
				promptText = this.processor.apply_chat_template(processedMessages, {
					add_generation_prompt: true,
				});
			}

			// Manually append <think> for Qwen3.5 if the template didn't handle it
			if (enableThinking && !promptText.includes("<think>")) {
				promptText += "<think>\n";
			}
		}

		const inputs = await this.processor(promptText);

		let fullText = "";
		let isDone = false;

		const streamer = new TextStreamer(this.processor.tokenizer, {
			skip_prompt: true,
			skip_special_tokens: !enableThinking,
			callback_function: (text: string) => {
				if (isDone || internalSignal.aborted || signal?.aborted) return;
				fullText += text;
				onChunk(text);
			},
		});

		const sampling = this._config?.sampling;
		const params = enableThinking
			? (sampling?.thinking ?? sampling?.nonThinking)
			: sampling?.nonThinking;

		const generationOptions: any = {
			...inputs,
			max_new_tokens: params?.max_new_tokens ?? 8192,
			temperature: params?.temperature ?? 1.0,
			top_p: params?.top_p ?? 1.0,
			top_k: params?.top_k ?? 20,
			min_p: params?.min_p ?? 0.0,
			presence_penalty: params?.presence_penalty ?? 1.5,
			repetition_penalty: params?.repetition_penalty ?? 1.2,
			streamer,
		};

		try {
			const outputs = await this.model.generate(generationOptions);
			const totalTokens = outputs[0]?.length ?? 0;

			isDone = true;
			return { text: fullText, usage: { totalTokens } };
		} catch (err) {
			if (internalSignal.aborted || signal?.aborted) {
				isDone = true;
				return { text: fullText, usage: { totalTokens: 0 } };
			}
			throw err;
		} finally {
			this.abortController = null;
		}
	}

	stop() {
		this.abortController?.abort();
	}

	resetStatus() {
		this._status = "idle";
		this._progress = 0;
		this._error = null;
		this._downloaded = false;
		for (const cb of this.listeners) {
			cb(this.getInfo());
		}
	}

	async delete() {
		this.abortController?.abort();
		this.abortController = null;

		if (this.model) {
			try {
				this.model.dispose();
			} catch {}
			this.model = null;
		}
		this.processor = null;

		await clearModelCache(this.modelId);

		this._status = "idle";
		this._progress = 0;
		this._error = null;
		this._downloaded = false;
		for (const cb of this.listeners) {
			cb(this.getInfo());
		}
	}
}

export const localLLM = new LocalLLM();
