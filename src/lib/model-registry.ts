export type DtypeValue =
	| "fp16"
	| "q4f16"
	| "auto"
	| "fp32"
	| "q8"
	| "int8"
	| "uint8"
	| "q4"
	| "bnb4";

export type ModelClass = "Qwen3_5" | "Gemma4";

export type ThinkingTagFormat = "qwen" | "gemma" | null;

export interface SamplingParams {
	temperature: number;
	top_p: number;
	top_k: number;
	min_p: number;
	presence_penalty: number;
	repetition_penalty: number;
	max_new_tokens: number;
}

export interface ModelConfig {
	id: string;
	name: string;
	displayName: string;
	size: string;
	description: string;
	modelClass: ModelClass;
	dtype:
		| DtypeValue
		| {
				embed_tokens: DtypeValue;
				vision_encoder: DtypeValue;
				decoder_model_merged: DtypeValue;
		  };
	sampling: {
		thinking: SamplingParams;
		nonThinking: SamplingParams;
	};
	thinking: {
		enabled: boolean;
		tagFormat: ThinkingTagFormat;
	};
}

export const MODEL_REGISTRY: Record<string, ModelConfig> = {
	"onnx-community/Qwen3.5-0.8B-ONNX": {
		id: "onnx-community/Qwen3.5-0.8B-ONNX",
		name: "Qwen3.5 0.8B",
		displayName: "Qwen3.5 0.8B",
		size: "~850 MB",
		description: "ONNX q4f16 quantized · WebGPU accelerated",
		modelClass: "Qwen3_5",
		dtype: {
			embed_tokens: "fp16",
			vision_encoder: "fp16",
			decoder_model_merged: "q4f16",
		},
		sampling: {
			thinking: {
				temperature: 1.0,
				top_p: 0.95,
				top_k: 20,
				min_p: 0.0,
				presence_penalty: 1.5,
				repetition_penalty: 1.2,
				max_new_tokens: 32768,
			},
			nonThinking: {
				temperature: 1.0,
				top_p: 1.0,
				top_k: 20,
				min_p: 0.0,
				presence_penalty: 2.0,
				repetition_penalty: 1.2,
				max_new_tokens: 8192,
			},
		},
		thinking: {
			enabled: true,
			tagFormat: "qwen",
		},
	},
	"onnx-community/Qwen3.5-2B-ONNX": {
		id: "onnx-community/Qwen3.5-2B-ONNX",
		name: "Qwen3.5 2B",
		displayName: "Qwen3.5 2B",
		size: "~2.0 GB",
		description: "ONNX q4f16 quantized · WebGPU accelerated",
		modelClass: "Qwen3_5",
		dtype: {
			embed_tokens: "q4f16",
			vision_encoder: "q4f16",
			decoder_model_merged: "q4f16",
		},
		sampling: {
			thinking: {
				temperature: 1.0,
				top_p: 0.95,
				top_k: 20,
				min_p: 0.0,
				presence_penalty: 1.5,
				repetition_penalty: 1.2,
				max_new_tokens: 32768,
			},
			nonThinking: {
				temperature: 1.0,
				top_p: 1.0,
				top_k: 20,
				min_p: 0.0,
				presence_penalty: 2.0,
				repetition_penalty: 1.2,
				max_new_tokens: 8192,
			},
		},
		thinking: {
			enabled: true,
			tagFormat: "qwen",
		},
	},
	"onnx-community/gemma-4-E2B-it-ONNX": {
		id: "onnx-community/gemma-4-E2B-it-ONNX",
		name: "Gemma 4 E2B",
		displayName: "Gemma 4 E2B",
		size: "~2.3 GB",
		description: "Google DeepMind · q4f16 quantized · WebGPU accelerated",
		modelClass: "Gemma4",
		dtype: "q4f16",
		sampling: {
			thinking: {
				temperature: 1.0,
				top_p: 0.95,
				top_k: 64,
				min_p: 0.0,
				presence_penalty: 0.0,
				repetition_penalty: 1.0,
				max_new_tokens: 32768,
			},
			nonThinking: {
				temperature: 1.0,
				top_p: 0.95,
				top_k: 64,
				min_p: 0.0,
				presence_penalty: 0.0,
				repetition_penalty: 1.0,
				max_new_tokens: 8192,
			},
		},
		thinking: {
			enabled: true,
			tagFormat: "gemma",
		},
	},
};

export const DEFAULT_MODEL_ID = "onnx-community/Qwen3.5-0.8B-ONNX";

export function getAvailableModels(): ModelConfig[] {
	return Object.values(MODEL_REGISTRY);
}

export function getModelConfig(modelId: string): ModelConfig | null {
	return MODEL_REGISTRY[modelId] ?? null;
}
