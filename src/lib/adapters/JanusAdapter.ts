import {
	AutoProcessor,
	MultiModalityCausalLM,
} from "@huggingface/transformers";
import type { ModelConfig } from "../model-registry";
import { BaseAdapter } from "./BaseAdapter";
import type { GenerateOptions, Message, ModelStatus } from "./types";

export class JanusAdapter extends BaseAdapter {
	async load(
		config: ModelConfig,
		device: "webgpu" | "wasm",
		onProgress: (
			pct: number,
			status: ModelStatus,
			downloads: Record<string, number>,
		) => void,
	) {
		this.config = config;
		this.device = device;
		const cb = this.getProgressCallback();

		this.processor = await AutoProcessor.from_pretrained(config.id, {
			progress_callback: (e: any) => cb(e, onProgress),
		});

		await this.loadChatTemplate();

		console.log(`[Loader] Using JanusAdapter strategy with device: ${device}`);
		this.model = await MultiModalityCausalLM.from_pretrained(config.id, {
			dtype: config.dtype,
			device: device,
			progress_callback: (e: any) => cb(e, onProgress),
		});
	}

	async prepareInputs(messages: Message[], options?: GenerateOptions) {
		// Janus uses <image_placeholder> text tokens for each image.
		const formattedMessages = messages.map((msg) => {
			if (typeof msg.content === "string") {
				return { ...msg, content: [{ type: "text", text: msg.content }] };
			}
			if (Array.isArray(msg.content)) {
				return {
					...msg,
					content: msg.content.map((part) => {
						if (part.type === "image") {
							return { type: "text", text: "<image_placeholder>\n" };
						}
						return part;
					}),
				};
			}
			return msg;
		});

		const tokenizer = this.processor.tokenizer || this.processor;
		let prompt = tokenizer.apply_chat_template(formattedMessages, {
			tokenize: false,
			add_generation_prompt: true,
			chat_template: this.config.chatTemplate || tokenizer.chat_template,
		});

		const enableThinking = options?.thinking ?? this.config.thinking.enabled;
		if (enableThinking) {
			const tagFormat = this.config.thinking.tagFormat ?? "qwen";
			const startTag =
				this.config.thinking.customTags?.start ??
				(tagFormat === "gemma" ? "<|channel>thought\n" : "onnais\n");
			prompt += startTag;
		}

		// Collect all image URLs in the same order they appear in messages
		const allImageUrls: string[] = [];
		for (const msg of messages) {
			if (Array.isArray(msg.content)) {
				for (const part of msg.content) {
					if (part.type === "image" && typeof part.image === "string") {
						allImageUrls.push(part.image);
					}
				}
			}
		}

		if (allImageUrls.length > 0) {
			const rawImages = await this.getRawImages(allImageUrls);

			try {
				let inputs: any;
				try {
					inputs = await this.processor(prompt, rawImages);
				} catch {
					inputs = await this.processor({ text: prompt, images: rawImages });
				}
				return inputs;
			} catch (err) {
				console.error("[JanusAdapter] Processor failed", err);
				throw err;
			}
		} else {
			return await tokenizer(prompt);
		}
	}

	async generate(
		inputs: any,
		onChunk: (text: string) => void,
		signal: AbortSignal,
		options?: GenerateOptions,
	) {
		return await this.streamGeneration(inputs, onChunk, signal, options);
	}
}
