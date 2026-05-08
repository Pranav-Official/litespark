import { Gemma4Adapter } from "./Gemma4Adapter";
import { LiquidLFMAdapter } from "./LiquidLFMAdapter";
import { Qwen3Adapter } from "./Qwen3Adapter";
import type { IModelAdapter } from "./types";

export const ADAPTERS: Record<string, new () => IModelAdapter> = {
	Gemma4: Gemma4Adapter,
	Qwen3: Qwen3Adapter,
	LiquidLFM: LiquidLFMAdapter,
};

export class AdapterFactory {
	static create(modelClass: string): IModelAdapter {
		const AdapterClass = ADAPTERS[modelClass];
		if (AdapterClass) {
			return new AdapterClass();
		}
		console.warn(`[LiteSpark] No adapter found for model class: ${modelClass}. Falling back to Gemma4Adapter.`);
		return new Gemma4Adapter();
	}
}
