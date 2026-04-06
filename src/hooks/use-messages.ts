import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { asc, eq } from "drizzle-orm";
import { db } from "#/db";
import { messages } from "#/db/schema";

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
	});
}

export function useAddMessage() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			chatId,
			role,
			content,
		}: {
			chatId: number;
			role: string;
			content: string;
		}) => {
			const result = await db
				.insert(messages)
				.values({ chatId, role, content })
				.returning();
			return result[0];
		},
		onSuccess: (_, { chatId }) => {
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
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["messages"] });
		},
	});
}
