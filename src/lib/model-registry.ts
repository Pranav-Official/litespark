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

export type ModelClass = "TextCausal" | "VisionSeq" | "Janus" | "Other";

export interface ThinkingTags {
	start: string;
	end: string[];
	suffix?: string;
}

export type ThinkingTagFormat = "qwen" | "gemma" | "custom" | null;

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
	dtype: DtypeValue | Record<string, DtypeValue>;
	sampling: {
		thinking: SamplingParams;
		nonThinking: SamplingParams;
	};
	thinking: {
		enabled: boolean;
		tagFormat: ThinkingTagFormat;
		customTags?: ThinkingTags;
	};
	modality: "text" | "multimodal";
	chatTemplate?: string;
	pathMap?: Record<string, string>;
	repoFiles?: string[];
	architecture?: string;
	isDefault?: number;
}

export function parseModelConfig(row: any): ModelConfig {
	return {
		...row,
		modality: row.modality ?? "text",
		dtype: typeof row.dtype === "string" ? JSON.parse(row.dtype) : row.dtype,
		pathMap:
			typeof row.pathMap === "string" ? JSON.parse(row.pathMap) : row.pathMap,
		repoFiles:
			typeof row.repoFiles === "string"
				? JSON.parse(row.repoFiles)
				: row.repoFiles,
		sampling:
			typeof row.sampling === "string"
				? JSON.parse(row.sampling)
				: row.sampling,
		thinking:
			typeof row.thinking === "string"
				? JSON.parse(row.thinking)
				: row.thinking,
	};
}

// export const MODEL_REGISTRY: Record<string, ModelConfig> = {
// 	"onnx-community/gemma-4-E2B-it-ONNX": {
// 		id: "onnx-community/gemma-4-E2B-it-ONNX",
// 		name: "Gemma 4 E2B",
// 		displayName: "Gemma 4 E2B",
// 		size: "~2.2 GB",
// 		description: "Google DeepMind · q4 quantized · WebGPU accelerated",
// 		modelClass: "VisionSeq",
// 		dtype: "q4",
// 		sampling: {
// 			thinking: {
// 				temperature: 1.0,
// 				top_p: 0.95,
// 				top_k: 64,
// 				min_p: 0.0,
// 				presence_penalty: 0.0,
// 				repetition_penalty: 1.0,
// 				max_new_tokens: 4096,
// 			},
// 			nonThinking: {
// 				temperature: 1.0,
// 				top_p: 0.95,
// 				top_k: 64,
// 				min_p: 0.0,
// 				presence_penalty: 0.0,
// 				repetition_penalty: 1.0,
// 				max_new_tokens: 2048,
// 			},
// 		},
// 		thinking: {
// 			enabled: true,
// 			tagFormat: "gemma",
// 		},
// 		modality: "multimodal",
// 	},
// };

export const DEFAULT_MODEL_ID = "onnx-community/gemma-4-E2B-it-ONNX";

// export function getAvailableModels(): ModelConfig[] {
// 	return Object.values(MODEL_REGISTRY);
// }

// export function getModelConfig(modelId: string): ModelConfig | null {
// 	return MODEL_REGISTRY[modelId] ?? null;
// }
