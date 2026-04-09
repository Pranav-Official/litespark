import { useCallback, useRef, useState } from "react";

type ThinkingTagFormat = "qwen" | "gemma";

const TAG_CONFIGS: Record<
	ThinkingTagFormat,
	{ start: string; end: string[]; suffix?: string }
> = {
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

export function useThinkingParser(tagFormat: ThinkingTagFormat) {
	const rawRef = useRef("");
	const [thinking, setThinking] = useState("");
	const [message, setMessage] = useState("");

	const feed = useCallback(
		(chunk: string) => {
			// Return empty if no chunk
			if (!chunk) return { thinking: "", message: "" };

			rawRef.current += chunk;
			const raw = rawRef.current;
			const config = TAG_CONFIGS[tagFormat];

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
		[tagFormat],
	);

	const reset = useCallback(() => {
		rawRef.current = "";
		setThinking("");
		setMessage("");
	}, []);

	return { thinking, message, feed, reset };
}
