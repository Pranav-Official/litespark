import { JanusAdapter } from "./JanusAdapter";
import { TextCausalAdapter } from "./TextCausalAdapter";
import type { IModelAdapter } from "./types";
import { VisionSeqAdapter } from "./VisionSeqAdapter";

export class AdapterFactory {
	static create(modelClass: string): IModelAdapter {
		switch (modelClass) {
			case "TextCausal":
				return new TextCausalAdapter();
			case "VisionSeq":
				return new VisionSeqAdapter();
			case "Janus":
				return new JanusAdapter();
			default:
				// Fallback to text causal if unknown
				return new TextCausalAdapter();
		}
	}
}
