import "./patch-fetch";
import { env } from "@huggingface/transformers";
import {
	AdapterFactory,
	type GenerateOptions,
	type IModelAdapter,
	type ModelStatus,
} from "./adapters";
import type { ModelConfig } from "./model-registry";

export type { ModelStatus, GenerateOptions };

export interface ModelInfo {
	modelId: string | null;
	status: ModelStatus;
	progress: number;
	error: string | null;
	downloads?: Record<string, number>;
}

env.allowLocalModels = false;
env.useBrowserCache = true;

// CRITICAL WEBGPU CONFIGURATION
if (env.backends?.onnx?.wasm) {
	// Disable web workers. WebGPU data transfers require the main thread.
	(env.backends.onnx.wasm as any).proxy = false;
	// Lock CPU threads. Prevents WASM from hijacking the execution graph.
	env.backends.onnx.wasm.numThreads = 1;
}

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
				if (
					requests.some(
						(req) =>
							req.url.includes(modelId) &&
							(req.url.includes(".onnx") || req.url.includes(".onnx_data")),
					)
				) {
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
 * Main LocalLLM Coordinator
 */
class LocalLLM {
	private _adapter: IModelAdapter | null = null;
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
		return this._status === "ready" && this._adapter !== null;
	}

	setDevice(device: "webgpu" | "wasm") {
		this._device = device;
		if (this._adapter) this.unload();
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
		return await isModelInBrowserCache(modelId);
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
				if (
					allUrls.some(
						(url) =>
							url.includes(id) &&
							(url.includes(".onnx") || url.includes(".onnx_data")),
					)
				) {
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

		// 1. Diagnostic: Check for WebGPU if requested
		if (this._device === "webgpu") {
			if (!(navigator as any).gpu) {
				const err =
					"WebGPU is not supported by your browser or environment. Falling back to CPU/WASM.";
				console.error(`[LiteSpark] ${err}`);
				this._error = err;
				this.setStatus("error", 0);
				throw new Error(err);
			}
			console.log("[LiteSpark] WebGPU confirmed available in navigator.gpu");
		}

		this.setStatus("loading", 0);

		try {
			// Dispose previous adapter
			if (this._adapter) this._adapter.dispose();

			// Use AdapterFactory based on modelClass
			this._adapter = AdapterFactory.create(this._config.modelClass);

			await this._adapter.load(
				this._config,
				this._device,
				(pct, status, downloads) => {
					this._progress = pct;
					this._status = status;
					this._downloads = downloads;
					onProgress?.(pct);
					this.notify();
				},
			);

			this.setStatus("ready", 100);
		} catch (err) {
			this._error = (err as Error).message;
			this.setStatus("error", 0);
			throw err;
		}
	}

	unload() {
		this.abortController?.abort();
		if (this._adapter) {
			this._adapter.dispose();
			this._adapter = null;
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
		if (!this._adapter || !this.isReady) throw new Error("Model not ready");
		this.abortController = new AbortController();

		const combinedSignal = signal ? signal : this.abortController.signal;

		try {
			const inputs = await this._adapter.prepareInputs(messages, options);
			return await this._adapter.generate(
				inputs,
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
