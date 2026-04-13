import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { asc, eq } from "drizzle-orm";
import { db } from "#/db";
import { messages } from "#/db/schema";

export type MessageRow = typeof messages.$inferSelect;

export function useMessages(chatId: number | undefined) {
	return useQuery({
		queryKey: ["messages", chatId],
		queryFn: async () => {
			if (!chatId) return [];
			return await db
				.select()
				.from(messages)
				.where(eq(messages.chatId, chatId))
				.orderBy(asc(messages.createdAt));
		},
		enabled: !!chatId,
		placeholderData: keepPreviousData,
	});
}

export function useAddMessage() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			chatId,
			role,
			content,
			thinking,
			model,
			totalTokens,
			timeTakenMs,
		}: {
			chatId: number;
			role: string;
			content: string;
			thinking?: string;
			model?: string;
			totalTokens?: number;
			timeTakenMs?: number;
		}) => {
			const result = await db
				.insert(messages)
				.values({
					chatId,
					role,
					content,
					thinking,
					model,
					totalTokens,
					timeTakenMs,
				})
				.returning();
			return result[0];
		},
		onSuccess: (data, { chatId }) => {
			// Update the cache immediately with the returned DB row
			queryClient.setQueryData<MessageRow[]>(
				["messages", chatId],
				(old = []) => [...old, data],
			);
			// Also invalidate to ensure sync
			queryClient.invalidateQueries({ queryKey: ["messages", chatId] });
		},
	});
}

export function useDeleteMessagesByChatId() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (chatId: number) => {
			await db.delete(messages).where(eq(messages.chatId, chatId));
		},
		onMutate: async (chatId) => {
			await queryClient.cancelQueries({ queryKey: ["messages", chatId] });
			const previousMessages = queryClient.getQueryData<MessageRow[]>([
				"messages",
				chatId,
			]);
			queryClient.setQueryData<MessageRow[]>(["messages", chatId], []);
			return { previousMessages, chatId };
		},
		onError: (_err, _chatId, context) => {
			if (context?.chatId) {
				queryClient.setQueryData(
					["messages", context.chatId],
					context.previousMessages,
				);
			}
		},
		onSettled: (_, __, chatId) => {
			queryClient.invalidateQueries({ queryKey: ["messages", chatId] });
		},
	});
}
