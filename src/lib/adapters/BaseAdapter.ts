import { RawImage, TextStreamer } from "@huggingface/transformers";
import type { ModelConfig } from "../model-registry";
import type {
	GenerateOptions,
	IModelAdapter,
	Message,
	ModelStatus,
} from "./types";

export abstract class BaseAdapter implements IModelAdapter {
	protected processor: any = null;
	protected model: any = null;
	protected config!: ModelConfig;
	protected device!: "webgpu" | "wasm";
	protected downloads: Record<string, number> = {};
	protected imageCache: Map<string, any> = new Map();

	abstract load(
		config: ModelConfig,
		device: "webgpu" | "wasm",
		onProgress: (
			pct: number,
			status: ModelStatus,
			downloads: Record<string, number>,
		) => void,
		localFilesOnly?: boolean,
	): Promise<void>;

	abstract prepareInputs(
		messages: Message[],
		options?: GenerateOptions,
	): Promise<any>;

	abstract generate(
		inputs: any,
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
		this.imageCache.clear();
	}

	protected getProgressCallback() {
		let lastPct = -1;
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

				const values = Object.values(this.downloads);
				const total = values.reduce((a, b) => a + b, 0);
				const avg = total / values.length;
				const roundedPct = Math.round(avg);

				if (roundedPct !== lastPct) {
					lastPct = roundedPct;
					onProgress(roundedPct, "loading", { ...this.downloads });
				}
			} else if (e.status === "done") {
				if (e.file) this.downloads[e.file] = 100;
				if (lastPct !== 100) {
					lastPct = 100;
					onProgress(100, "loading", { ...this.downloads });
				}
			}
		};
	}

	protected get progressCallback() {
		return this.getProgressCallback();
	}

	protected async getRawImages(imageUrls: string[]): Promise<any[]> {
		const rawImages: any[] = [];
		for (const url of imageUrls) {
			if (this.imageCache.has(url)) {
				rawImages.push(this.imageCache.get(url));
			} else {
				const response = await fetch(url);
				const blob = await response.blob();
				const rawImage = await RawImage.fromBlob(blob);
				this.imageCache.set(url, rawImage);
				rawImages.push(rawImage);
			}
		}
		return rawImages;
	}

	protected async loadChatTemplate() {
		const tokenizer = this.processor.tokenizer || this.processor;

		// 1. If explicit template provided in config, use it
		if (this.config.chatTemplate) {
			tokenizer.chat_template = this.config.chatTemplate;
			return;
		}

		// 2. If already exists on tokenizer, we are good
		if (tokenizer.chat_template) return;

		// 3. Fallback: Try to fetch chat_template.jinja from the repository
		try {
			const templateUrl = `https://huggingface.co/${this.config.id}/resolve/main/chat_template.jinja`;
			const response = await fetch(templateUrl);
			if (response.ok) {
				const template = await response.text();
				tokenizer.chat_template = template;
				console.log(
					`[LiteSpark] Loaded chat_template.jinja from repository for ${this.config.id}`,
				);
			}
		} catch (e) {
			console.warn(
				`[LiteSpark] Failed to load chat template from repository for ${this.config.id}`,
				e,
			);
		}
	}

	protected async preparePrompt(
		messages: Message[],
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

		const tokenizer = this.processor.tokenizer || this.processor;
		const prompt = tokenizer.apply_chat_template(formattedMessages, {
			tokenize: false,
			add_generation_prompt: true,
			chat_template: this.config.chatTemplate || tokenizer.chat_template,
		});

		if (enableThinking) {
			const startTag =
				this.config.thinking.customTags?.start ??
				(tagFormat === "gemma" ? "<|channel>thought\n" : "onnais\n");
			return prompt + startTag;
		}

		return prompt;
	}

	protected async streamGeneration(
		inputs: any,
		onChunk: (text: string) => void,
		signal: AbortSignal,
		options?: GenerateOptions,
	) {
		const enableThinking = options?.thinking ?? this.config.thinking.enabled;
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

		console.log(`[LiteSpark] Generating with device: ${this.device}`);
		try {
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
		} catch (err) {
			const errMsg = (err as Error).message;
			if (
				errMsg.includes("OUT_OF_DEVICE_MEMORY") ||
				errMsg.includes("out of memory")
			) {
				console.error("[LiteSpark] WebGPU OOM Error detected!", err);
				throw new Error(
					"GPU Out of Memory: The model or conversation history is too large for your GPU. Try reducing max tokens or using a smaller model.",
				);
			}
			console.error("[LiteSpark] Generation failed:", err);
			console.log("[LiteSpark] Inputs keys:", Object.keys(inputs));
			throw err;
		}
	}
}
