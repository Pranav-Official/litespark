import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { localLLM } from "#/lib/local-llm";
import { useChats, useUpdateChatTitle } from "./use-chats";
import { useAddMessage, useMessages } from "./use-messages";
import { useActiveProvider, useAllSettings } from "./use-settings";
import { DEFAULT_TAG_CONFIGS, useThinkingParser } from "./use-thinking-parser";

const PROVIDERS = {
	openai: (apiKey: string) => createOpenAI({ apiKey }),
	gemini: (apiKey: string) => createGoogleGenerativeAI({ apiKey }),
	openrouter: (apiKey: string) => createOpenRouter({ apiKey }),
};

const MODELS: Record<string, { id: string; vision: boolean }[]> = {
	openai: [
		{ id: "gpt-4o", vision: true },
		{ id: "gpt-4o-mini", vision: true },
		{ id: "o3-mini", vision: false },
		{ id: "o1", vision: true },
	],
	gemini: [
		{ id: "gemini-2.5-flash", vision: true },
		{ id: "gemini-2.5-pro", vision: true },
		{ id: "gemini-2.0-flash", vision: true },
		{ id: "gemini-1.5-flash", vision: true },
	],
	openrouter: [
		{ id: "openai/gpt-4o", vision: true },
		{ id: "anthropic/claude-3.5-sonnet", vision: true },
		{ id: "google/gemini-2.5-flash", vision: true },
		{ id: "meta-llama/llama-3.3-70b-instruct", vision: false },
		{ id: "mistralai/mistral-large-2411", vision: false },
	],
};

export function getAvailableModels(provider: string) {
	return (MODELS[provider] ?? MODELS.openai).map((m) => m.id);
}

export function useChatSession(chatId: number | undefined) {
	const { provider, apiKey, model } = useActiveProvider();
	const { data: settingsMap } = useAllSettings();
	const addMessage = useAddMessage();
	const updateChatTitle = useUpdateChatTitle();
	const { refetch: refetchChats } = useChats();
	const { data: dbMessages } = useMessages(chatId);

	const inferenceMode = settingsMap?.inference_mode ?? "cloud";
	const isLocal = inferenceMode === "local";

	const modelConfig = localLLM.config;
	const supportsVision = isLocal
		? modelConfig?.modality === "multimodal"
		: (MODELS[provider]?.find((m) => m.id === model)?.vision ?? false);

	const thinkingConfig = modelConfig?.thinking;
	const tags =
		thinkingConfig?.customTags ??
		(thinkingConfig?.tagFormat === "gemma"
			? DEFAULT_TAG_CONFIGS.gemma
			: DEFAULT_TAG_CONFIGS.qwen);
	const parser = useThinkingParser(tags);

	const [input, setInput] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const abortRef = useRef<AbortController | null>(null);
	const streamingIdRef = useRef<string>("");

	// Track if we have a pending user message that hasn't hit DB yet
	// This ensures instant UI feedback even if IndexedDB takes a few ms
	const [optimisticUserMessage, setOptimisticUserMessage] = useState<{
		content: string;
		images?: string[];
	} | null>(null);

	const parserRef = useRef(parser);
	useEffect(() => {
		parserRef.current = parser;
	}, [parser]);

	const sendMessage = useCallback(
		async (content?: string, thinking?: boolean, images?: string[]) => {
			const messageContent = content || input;
			if (!messageContent.trim() && (!images || images.length === 0)) return;
			if (!chatId) return;
			if (!isLocal && !apiKey) return;

			setIsLoading(true);
			abortRef.current = new AbortController();
			parserRef.current.reset();

			setInput("");
			setOptimisticUserMessage({ content: messageContent.trim(), images });

			try {
				// 1. Save user message to DB
				// useAddMessage updates the query cache instantly on success
				await addMessage.mutateAsync({
					chatId: chatId as number,
					role: "user",
					content: messageContent.trim(),
					images,
				});

				// Clear optimistic state now that it's in dbMessages
				setOptimisticUserMessage(null);

				// Use latest dbMessages for history + new user message
				const history = [
					...(dbMessages ?? []).map((m) => {
						const hasImages = m.images && JSON.parse(m.images).length > 0;
						return {
							role: m.role as "user" | "assistant" | "system",
							content:
								hasImages && supportsVision
									? [
											...JSON.parse(m.images as string).map((img: string) => ({
												type: "image",
												image: img,
											})),
											{ type: "text", text: m.content },
										]
									: m.content,
						};
					}),
					{
						role: "user" as const,
						content:
							images && images.length > 0 && supportsVision
								? [
										...images.map((img) => ({ type: "image", image: img })),
										{ type: "text", text: messageContent.trim() },
									]
								: messageContent.trim(),
					},
				] as any[];

				streamingIdRef.current = crypto.randomUUID();
				let finalContent = "";
				let finalThinking = "";
				let totalTokens = 0;
				let timeTakenMs = 0;
				const startTime = performance.now();

				// 2. Generate response
				if (isLocal) {
					const response = await localLLM.generate(
						history,
						(chunk) => {
							const parsed = parserRef.current.feed(chunk);
							if (parsed) {
								finalThinking = parsed.thinking;
								finalContent = parsed.message;
							}
							flushSync(() => {});
						},
						abortRef.current.signal,
						{ thinking },
					);

					totalTokens = response.usage.totalTokens;
					timeTakenMs = Math.round(performance.now() - startTime);
				} else {
					const providerInstance =
						PROVIDERS[provider as keyof typeof PROVIDERS]?.(apiKey);
					if (!providerInstance) return;

					const result = streamText({
						model: providerInstance.languageModel(model),
						messages: history,
						abortSignal: abortRef.current.signal,
					});

					for await (const chunk of result.textStream) {
						const parsed = parserRef.current.feed(chunk);
						if (parsed) {
							finalThinking = parsed.thinking;
							finalContent = parsed.message;
						}
						flushSync(() => {});
					}

					const usage = await result.usage;
					totalTokens = usage.totalTokens ?? 0;
					timeTakenMs = Math.round(performance.now() - startTime);
				}

				// 3. Save assistant message to DB
				console.log("FINAL CONTENT TO SAVE:", finalContent);
				await addMessage.mutateAsync({
					chatId: chatId as number,
					role: "assistant",
					content: finalContent,
					thinking: finalThinking || undefined,
					model: isLocal
						? (localLLM.config?.displayName ?? "Local Model")
						: model,
					totalTokens: totalTokens || undefined,
					timeTakenMs: timeTakenMs || undefined,
				});

				// Clear parser immediately after saving
				parserRef.current.reset();

				// 4. Update chat title if this was the first message
				const chatsResult = await refetchChats();
				const currentChat = chatsResult.data?.find(
					(c) => c.id === (chatId as number),
				);
				if (currentChat && currentChat.title === "New Chat") {
					const titleWords = messageContent.trim().split(" ");
					const title =
						titleWords.slice(0, 5).join(" ") +
						(titleWords.length > 5 ? "..." : "");
					updateChatTitle.mutate({ chatId: chatId as number, title });
				}
			} catch (error) {
				if ((error as Error).name !== "AbortError") {
					console.error("Chat error:", error);
				}
				setOptimisticUserMessage(null);
			} finally {
				setIsLoading(false);
				abortRef.current = null;
			}
		},
		[
			input,
			apiKey,
			chatId,
			provider,
			model,
			addMessage,
			updateChatTitle,
			refetchChats,
			isLocal,
			dbMessages,
			supportsVision,
		],
	);

	const stop = useCallback(() => {
		if (isLocal) {
			localLLM.stop();
		} else {
			abortRef.current?.abort();
		}

		setIsLoading(false);

		// If we stopped mid-stream, save what we have to the DB
		if (parserRef.current.thinking || parserRef.current.message) {
			if (chatId) {
				addMessage.mutate({
					chatId: chatId as number,
					role: "assistant",
					content: parserRef.current.message,
					thinking: parserRef.current.thinking || undefined,
				});
			}
			parserRef.current.reset();
		}
	}, [isLocal, chatId, addMessage]);

	const reload = useCallback(() => {
		const allMessages = dbMessages ?? [];
		const lastUserMessage = allMessages.filter((m) => m.role === "user").pop();
		if (lastUserMessage) {
			sendMessage(lastUserMessage.content);
		}
	}, [dbMessages, sendMessage]);

	// Format persisted messages for display
	const persistedMessages = (dbMessages ?? []).map((m) => ({
		id: String(m.id),
		role: m.role as "user" | "assistant",
		content: m.content,
		images: m.images ? JSON.parse(m.images) : undefined,
		thinking: m.thinking || undefined,
		model: m.model || undefined,
		totalTokens: m.totalTokens || undefined,
		timeTakenMs: m.timeTakenMs || undefined,
	}));

	// Combine all sources for final display array
	const displayMessages = [
		...persistedMessages,
		...(optimisticUserMessage
			? [
					{
						id: "optimistic-user",
						role: "user" as const,
						content: optimisticUserMessage.content,
						images: optimisticUserMessage.images,
					},
				]
			: []),
		...(parser.thinking || parser.message
			? [
					{
						id: streamingIdRef.current,
						role: "assistant" as const,
						content: parser.message,
						thinking: parser.thinking || undefined,
						isStreaming: true,
					},
				]
			: []),
	];

	return {
		messages: displayMessages,
		input,
		setInput,
		isLoading,
		sendMessage,
		stop,
		reload,
		hasKey: isLocal || !!apiKey,
		isLocal,
		supportsVision,
	};
}
