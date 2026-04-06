import { PanelLeftOpen } from "lucide-react";
import { useParams } from "react-router-dom";
import MessageInput from "#/components/chat/message-input";
import MessageList from "#/components/chat/message-list";
import { useSidebar } from "#/context/sidebar-context";
import { useChatSession } from "#/hooks/use-chat-session";
import { useChats } from "#/hooks/use-chats";

export default function ChatPage() {
	const { chatId } = useParams<{ chatId: string }>();
	const id = Number(chatId);
	const { openSidebar } = useSidebar();
	const { data: chats } = useChats();
	const currentChat = chats?.find((c) => c.id === id);

	const { messages, input, setInput, isLoading, sendMessage, stop, hasKey } =
		useChatSession(id);

	const handleSubmit = (content: string) => {
		sendMessage(content);
	};

	return (
		<div className="flex flex-1 flex-col">
			<div className="flex items-center gap-3 border-b border-zinc-800 px-3 py-2 lg:hidden">
				<button
					type="button"
					onClick={openSidebar}
					className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
				>
					<PanelLeftOpen className="h-5 w-5" />
				</button>
				<h2 className="flex-1 truncate text-sm font-medium text-zinc-100">
					{currentChat?.title ?? "Chat"}
				</h2>
			</div>

			{!hasKey && (
				<div className="border-b border-zinc-800 bg-amber-950/30 px-4 py-2 text-center text-xs text-amber-300">
					No API key configured.{" "}
					<a href="/settings" className="underline hover:text-amber-200">
						Go to Settings
					</a>{" "}
					to add your key.
				</div>
			)}

			<MessageList messages={messages} isLoading={isLoading} />

			<div className="border-t border-zinc-800 bg-zinc-950 px-4 py-4">
				<div className="mx-auto max-w-2xl">
					<MessageInput
						value={input}
						onChange={setInput}
						onSubmit={handleSubmit}
						onStop={stop}
						isLoading={isLoading}
						disabled={!hasKey}
					/>
				</div>
			</div>
		</div>
	);
}
