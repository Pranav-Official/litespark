import {
	AutoProcessor,
	Qwen3_5ForConditionalGeneration,
	RawImage,
} from "@huggingface/transformers";
import { BaseAdapter } from "./base";
import type { GenerateOptions, Message, ModelStatus } from "./types";
import type { ModelConfig } from "../model-registry";

export class Qwen3Adapter extends BaseAdapter {
	async load(
		config: ModelConfig,
		device: "webgpu" | "wasm",
		onProgress: (
			pct: number,
			status: ModelStatus,
			downloads: Record<string, number>,
		) => void,
		localFilesOnly?: boolean,
	) {
		this.config = config;
		this.device = device;
		const cb = this.getProgressCallback();

		this.processor = await AutoProcessor.from_pretrained(config.id, {
			progress_callback: (e: any) => cb(e, onProgress),
			local_files_only: localFilesOnly,
		});

		await this.loadChatTemplate();

		this.model = await Qwen3_5ForConditionalGeneration.from_pretrained(
			config.id,
			{
				dtype: config.dtype as any,
				device: device,
				progress_callback: (e: any) => cb(e, onProgress),
				local_files_only: localFilesOnly,
			},
		);
	}

	async prepareInputs(messages: Message[], options?: GenerateOptions) {
		const enableThinking = options?.thinking ?? this.config.thinking.enabled;

		const prompt = await this.processor.apply_chat_template(messages, {
			enable_thinking: enableThinking,
			add_generation_prompt: true,
		});

		const imageUrls: string[] = [];
		for (const msg of messages) {
			if (Array.isArray(msg.content)) {
				for (const part of msg.content) {
					if (part.type === "image") {
						imageUrls.push(part.image);
					}
				}
			}
		}

		if (imageUrls.length > 0) {
			const images = await Promise.all(
				imageUrls.map((url) => RawImage.read(url)),
			);

			const inputs = await this.processor(
				prompt,
				images,
				{
					return_tensors: "pt",
				},
			);
			return inputs;
		} else {
			const tokenizer = this.processor.tokenizer || this.processor;
			return await tokenizer(prompt, {
				return_tensors: "pt",
			});
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