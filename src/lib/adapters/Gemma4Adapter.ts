import {
	AutoProcessor,
	Gemma4ForConditionalGeneration,
	load_image,
	read_audio,
} from "@huggingface/transformers";
import { BaseAdapter } from "./base";
import type { GenerateOptions, Message, ModelStatus } from "./types";
import type { ModelConfig } from "../model-registry";

export class Gemma4Adapter extends BaseAdapter {
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

		this.model = await Gemma4ForConditionalGeneration.from_pretrained(
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

		// Extract images and audio
		const imageUrls: string[] = [];
		const audioUrls: string[] = [];

		for (const msg of messages) {
			if (Array.isArray(msg.content)) {
				for (const part of msg.content) {
					if (part.type === "image") {
						imageUrls.push(part.image);
					} else if ((part as any).type === "audio") {
						audioUrls.push((part as any).audio);
					}
				}
			}
		}

		const images = imageUrls.length > 0 ? await Promise.all(imageUrls.map(url => load_image(url))) : undefined;
		const audios = audioUrls.length > 0 ? await Promise.all(audioUrls.map(url => read_audio(url))) : undefined;

		const inputs = await this.processor(prompt, images, audios, {
			add_special_tokens: false,
		});

		return inputs;
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
