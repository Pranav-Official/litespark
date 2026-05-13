import {
	AutoProcessor,
	AutoModelForImageTextToText,
	load_image,
} from "@huggingface/transformers";
import { BaseAdapter } from "./base";
import type { GenerateOptions, Message, ModelStatus } from "./types";
import type { ModelConfig } from "../model-registry";

export class LiquidLFMAdapter extends BaseAdapter {
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

		const dtype = await this.resolveDtype(config.dtype, device);

		this.model = await AutoModelForImageTextToText.from_pretrained(
			config.id,
			{
				device: device,
				dtype: dtype as any,
				local_files_only: localFilesOnly,
				progress_callback: (e: any) => cb(e, onProgress),
			},
		);
	}

	private async resolveDtype(
		dtype: ModelConfig["dtype"],
		device: "webgpu" | "wasm",
	): Promise<ModelConfig["dtype"]> {
		if (device !== "webgpu") return dtype;

		const nav = navigator as any;
		if (!nav.gpu) return dtype;

		try {
			const adapter = await nav.gpu.requestAdapter();
			if (!adapter) return dtype;
			const hasFp16 = adapter.features?.has?.("shader-f16") ?? false;
			if (hasFp16) return dtype;
		} catch {
			return dtype;
		}

		if (typeof dtype === "object" && dtype !== null) {
			const remapped: Record<string, string> = {};
			for (const [key, value] of Object.entries(dtype)) {
				remapped[key] = value.replace("f16", "q4").replace("fp16", "q4");
			}
			return remapped as ModelConfig["dtype"];
		}

		return (typeof dtype === "string" ? dtype.replace("f16", "q4").replace("fp16", "q4") : dtype) as ModelConfig["dtype"];
	}

	async prepareInputs(messages: Message[], options?: GenerateOptions) {
		const prompt = await this.preparePrompt(messages, options);

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

		const images =
			imageUrls.length > 0
				? await Promise.all(imageUrls.map((url) => load_image(url)))
				: undefined;

		const inputs = await this.processor(prompt, images, {
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
