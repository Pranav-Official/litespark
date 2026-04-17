import {
	AutoModel,
	AutoModelForVision2Seq,
	AutoProcessor,
} from "@huggingface/transformers";
import type { ModelConfig } from "../model-registry";
import { BaseAdapter } from "./BaseAdapter";
import type { GenerateOptions, Message, ModelStatus } from "./types";

export class VisionSeqAdapter extends BaseAdapter {
	private successfulPatternIndex = -1;

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

		console.log(
			`[Loader] Using VisionSeqAdapter strategy with device: ${device}`,
		);
		try {
			this.model = await AutoModelForVision2Seq.from_pretrained(config.id, {
				dtype: config.dtype,
				device: device,
				progress_callback: (e: any) => cb(e, onProgress),
				local_files_only: localFilesOnly,
			});
		} catch (e2) {
			console.warn(
				"[Loader] AutoModelForVision2Seq failed, trying AutoModel fallback",
				e2,
			);
			this.model = await AutoModel.from_pretrained(config.id, {
				dtype: config.dtype,
				device: device,
				progress_callback: (e: any) => cb(e, onProgress),
				local_files_only: localFilesOnly,
			});
		}
	}

	dispose() {
		this.successfulPatternIndex = -1;
		super.dispose();
	}

	async prepareInputs(messages: Message[], options?: GenerateOptions) {
		const prompt = await this.preparePrompt(messages, options);

		// Collect all image URLs in message order
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
			console.log(
				`[VisionSeqAdapter] Preparing inputs with ${allImageUrls.length} images`,
			);
			const rawImages = await this.getRawImages(allImageUrls);

			if (typeof this.processor !== "function") {
				throw new Error("Processor is not a function");
			}

			let inputs: any;
			const patterns = [
				async () => await this.processor(prompt, rawImages),
				async () => await this.processor({ text: prompt, images: rawImages }),
				async () => await this.processor(rawImages, prompt),
				async () =>
					rawImages.length === 1
						? await this.processor({ text: prompt, images: rawImages[0] })
						: Promise.reject("Multi-image"),
				async () =>
					rawImages.length === 1
						? await this.processor(prompt, rawImages[0])
						: Promise.reject("Multi-image"),
			];

			const startIdx =
				this.successfulPatternIndex >= 0 ? this.successfulPatternIndex : 0;
			const reordered = [
				...patterns.slice(startIdx),
				...patterns.slice(0, startIdx),
			];

			for (let i = 0; i < reordered.length; i++) {
				const actualIdx = (startIdx + i) % patterns.length;
				try {
					inputs = await reordered[i]();
					if (inputs) {
						if (!inputs.input_ids) {
							const tokenizer = this.processor.tokenizer || this.processor;
							const { input_ids } = await tokenizer(prompt);
							inputs.input_ids = input_ids;
						}
						this.successfulPatternIndex = actualIdx;
						break;
					}
				} catch (e) {
					if (i === reordered.length - 1) throw e;
				}
			}

			return inputs;
		} else {
			const tokenizer = this.processor.tokenizer || this.processor;
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
