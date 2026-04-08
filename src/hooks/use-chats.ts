import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { desc, eq } from "drizzle-orm";
import { db } from "#/db";
import { chats, messages } from "#/db/schema";

export type Chat = typeof chats.$inferSelect;

export function useChats() {
	return useQuery({
		queryKey: ["chats"],
		queryFn: async () => {
			return await db.select().from(chats).orderBy(desc(chats.updatedAt));
		},
		placeholderData: keepPreviousData,
	});
}

export function useCreateChat() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ title }: { title?: string } = {}) => {
			const result = await db
				.insert(chats)
				.values({ title: title || "New Chat" })
				.returning();
			return result[0];
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["chats"] });
		},
	});
}

export function useDeleteChat() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (chatId: number) => {
			await db.delete(messages).where(eq(messages.chatId, chatId));
			await db.delete(chats).where(eq(chats.id, chatId));
		},
		onMutate: async (chatId) => {
			await queryClient.cancelQueries({ queryKey: ["chats"] });
			const previousChats = queryClient.getQueryData<Chat[]>(["chats"]);
			queryClient.setQueryData<Chat[]>(["chats"], (old) =>
				old?.filter((c) => c.id !== chatId),
			);
			return { previousChats };
		},
		onError: (_err, _newChat, context) => {
			queryClient.setQueryData(["chats"], context?.previousChats);
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ["chats"] });
			queryClient.invalidateQueries({ queryKey: ["messages"] });
		},
	});
}

export function useUpdateChatTitle() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			chatId,
			title,
		}: {
			chatId: number;
			title: string;
		}) => {
			await db
				.update(chats)
				.set({ title, updatedAt: new Date() })
				.where(eq(chats.id, chatId));
		},
		onMutate: async ({ chatId, title }) => {
			await queryClient.cancelQueries({ queryKey: ["chats"] });
			const previousChats = queryClient.getQueryData<Chat[]>(["chats"]);
			queryClient.setQueryData<Chat[]>(["chats"], (old) =>
				old?.map((c) =>
					c.id === chatId ? { ...c, title, updatedAt: new Date() } : c,
				),
			);
			return { previousChats };
		},
		onError: (_err, _newChat, context) => {
			queryClient.setQueryData(["chats"], context?.previousChats);
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ["chats"] });
		},
	});
}
