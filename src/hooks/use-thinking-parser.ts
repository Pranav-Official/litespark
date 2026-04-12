import { useCallback, useRef, useState } from "react";
import type { ThinkingTags } from "#/lib/model-registry";

export const DEFAULT_TAG_CONFIGS: Record<"qwen" | "gemma", ThinkingTags> = {
	qwen: {
		start: "<think>",
		end: [
			"</think>",
			"</thought>",
			"<|endofthought|>",
			"<|im_end|>",
			"<|endoftext|>",
		],
	},
	gemma: {
		start: "<|channel>thought\n",
		end: ["<channel|>", "<turn|>"],
		suffix: "<turn|>",
	},
};

function cleanMessage(text: string, suffix?: string): string {
	if (!suffix) return text;

	let processedText = text.trimEnd();

	if (processedText.endsWith(suffix)) {
		processedText = processedText.slice(0, -suffix.length);
	}

	return processedText.trimEnd();
}

export function useThinkingParser(config: ThinkingTags) {
	const rawRef = useRef("");
	const [thinking, setThinking] = useState("");
	const [message, setMessage] = useState("");

	const feed = useCallback(
		(chunk: string) => {
			// Return empty if no chunk
			if (!chunk) return { thinking: "", message: "" };

			rawRef.current += chunk;
			const raw = rawRef.current;

			let thinkEndIdx = -1;
			let matchedEndTag = "";

			for (const endTag of config.end) {
				const idx = raw.indexOf(endTag);
				if (idx !== -1 && (thinkEndIdx === -1 || idx < thinkEndIdx)) {
					thinkEndIdx = idx;
					matchedEndTag = endTag;
				}
			}

			let nextThinking = "";
			let nextMessage = "";

			if (thinkEndIdx !== -1) {
				const beforeEnd = raw.substring(0, thinkEndIdx);
				const afterEnd = raw.substring(thinkEndIdx + matchedEndTag.length);
				const thinkStartIdx = beforeEnd.indexOf(config.start);

				if (thinkStartIdx !== -1) {
					const beforeStart = beforeEnd.substring(0, thinkStartIdx);
					nextThinking = beforeEnd.substring(
						thinkStartIdx + config.start.length,
					);
					nextMessage = cleanMessage(beforeStart + afterEnd, config.suffix);
				} else {
					nextThinking = "";
					nextMessage = cleanMessage(beforeEnd + afterEnd, config.suffix);
				}
			} else {
				const thinkStartIdx = raw.indexOf(config.start);
				if (thinkStartIdx !== -1) {
					nextThinking = raw.substring(thinkStartIdx + config.start.length);
					nextMessage = cleanMessage(
						raw.substring(0, thinkStartIdx),
						config.suffix,
					);
				} else {
					nextMessage = cleanMessage(raw, config.suffix);
				}
			}

			setThinking(nextThinking);
			setMessage(nextMessage);

			// FIX: Return the parsed values synchronously
			return { thinking: nextThinking, message: nextMessage };
		},
		[config],
	);

	const reset = useCallback(() => {
		rawRef.current = "";
		setThinking("");
		setMessage("");
	}, []);

	return { thinking, message, feed, reset };
}
