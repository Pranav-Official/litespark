import { AutoModelForCausalLM, AutoTokenizer } from "@huggingface/transformers";
import type { ModelConfig } from "../model-registry";
import { BaseAdapter } from "./BaseAdapter";
import type { GenerateOptions, Message, ModelStatus } from "./types";

export class TextCausalAdapter extends BaseAdapter {
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

		this.processor = await AutoTokenizer.from_pretrained(config.id, {
			progress_callback: (e: any) => cb(e, onProgress),
		});

		await this.loadChatTemplate();

		console.log(
			`[Loader] Using TextCausalAdapter strategy with device: ${device}`,
		);
		this.model = await AutoModelForCausalLM.from_pretrained(config.id, {
			dtype: config.dtype,
			device: device,
			progress_callback: (e: any) => cb(e, onProgress),
		});
	}

	async prepareInputs(messages: Message[], options?: GenerateOptions) {
		const prompt = await this.preparePrompt(messages, options);
		const tokenizer = this.processor.tokenizer || this.processor;
		return await tokenizer(prompt);
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
