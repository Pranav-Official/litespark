import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText } from "ai";
import { useCallback, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useChats, useUpdateChatTitle } from "./use-chats";
import { useAddMessage, useMessages } from "./use-messages";
import { useActiveProvider } from "./use-settings";

const PROVIDERS = {
	openai: (apiKey: string) => createOpenAI({ apiKey }),
	gemini: (apiKey: string) => createGoogleGenerativeAI({ apiKey }),
	openrouter: (apiKey: string) => createOpenRouter({ apiKey }),
};

const MODELS: Record<string, string[]> = {
	openai: ["gpt-4o", "gpt-4o-mini", "o3-mini", "o1"],
	gemini: [
		"gemini-2.5-flash",
		"gemini-2.5-pro",
		"gemini-2.0-flash",
		"gemini-1.5-flash",
	],
	openrouter: [
		"openai/gpt-4o",
		"anthropic/claude-3.5-sonnet",
		"google/gemini-2.5-flash",
		"meta-llama/llama-3.3-70b-instruct",
		"mistralai/mistral-large-2411",
	],
};

export function getAvailableModels(provider: string) {
	return MODELS[provider] ?? MODELS.openai;
}

interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
}

export function useChatSession(chatId: number | undefined) {
	const { provider, apiKey, model } = useActiveProvider();
	const addMessage = useAddMessage();
	const updateChatTitle = useUpdateChatTitle();
	const { refetch: refetchChats } = useChats();
	const { data: dbMessages } = useMessages(chatId);

	const [pendingMessage, setPendingMessage] = useState<ChatMessage | null>(
		null,
	);
	const [streamingContent, setStreamingContent] = useState("");
	const [input, setInput] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const abortRef = useRef<AbortController | null>(null);
	const streamingIdRef = useRef<string>("");
	const streamingContentRef = useRef("");

	const sendMessage = useCallback(
		async (content?: string) => {
			const messageContent = content || input;
			if (!messageContent.trim() || !apiKey || !chatId) return;

			const providerInstance =
				PROVIDERS[provider as keyof typeof PROVIDERS]?.(apiKey);
			if (!providerInstance) return;

			setIsLoading(true);
			abortRef.current = new AbortController();
			setStreamingContent("");
			streamingContentRef.current = "";

			const userMessage: ChatMessage = {
				id: crypto.randomUUID(),
				role: "user",
				content: messageContent.trim(),
			};

			setPendingMessage(userMessage);
			setInput("");

			const history = [
				...(dbMessages ?? []).map((m) => ({
					role: m.role as "user" | "assistant" | "system",
					content: m.content,
				})),
				{ role: "user" as const, content: messageContent.trim() },
			];

			const assistantId = crypto.randomUUID();
			streamingIdRef.current = assistantId;

			try {
				const result = streamText({
					model: providerInstance.languageModel(model),
					messages: history,
					abortSignal: abortRef.current.signal,
				});

				for await (const chunk of result.textStream) {
					streamingContentRef.current += chunk;
					flushSync(() => setStreamingContent(streamingContentRef.current));
				}

				const finalContent = streamingContentRef.current;

				await addMessage.mutateAsync({
					chatId,
					role: "user",
					content: userMessage.content,
				});

				await addMessage.mutateAsync({
					chatId,
					role: "assistant",
					content: finalContent,
				});

				setPendingMessage(null);
				setStreamingContent("");
				streamingContentRef.current = "";

				const chatsResult = await refetchChats();
				const currentChat = chatsResult.data?.find((c) => c.id === chatId);
				if (currentChat && currentChat.title === "New Chat") {
					const title =
						userMessage.content.split(" ").slice(0, 5).join(" ") +
						(userMessage.content.split(" ").length > 5 ? "..." : "");
					updateChatTitle.mutate({ chatId, title });
				}
			} catch (error) {
				if ((error as Error).name !== "AbortError") {
					console.error("Chat error:", error);
				}
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
			dbMessages,
			addMessage,
			updateChatTitle,
			refetchChats,
		],
	);

	const stop = useCallback(() => {
		abortRef.current?.abort();
		setIsLoading(false);
		if (streamingContentRef.current) {
			setPendingMessage(null);
			setStreamingContent("");
			streamingContentRef.current = "";
		}
	}, []);

	const reload = useCallback(() => {
		const allMessages = [
			...(dbMessages ?? []).map((m) => ({
				id: String(m.id),
				role: m.role as "user" | "assistant",
				content: m.content,
			})),
		];
		const lastUserMessage = allMessages.filter((m) => m.role === "user").pop();
		if (lastUserMessage) {
			sendMessage(lastUserMessage.content);
		}
	}, [dbMessages, sendMessage]);

	const persistedMessages = (dbMessages ?? []).map((m) => ({
		id: String(m.id),
		role: m.role as "user" | "assistant",
		content: m.content,
	}));

	const displayMessages = [
		...persistedMessages,
		...(pendingMessage ? [pendingMessage] : []),
		...(streamingContent
			? [
					{
						id: streamingIdRef.current,
						role: "assistant" as const,
						content: streamingContent,
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
		hasKey: !!apiKey,
	};
}
