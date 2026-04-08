import { Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCreateChat } from "#/hooks/use-chats";

export default function HomePage() {
	const navigate = useNavigate();
	const createChat = useCreateChat();

	const handleNewChat = async () => {
		const chat = await createChat.mutateAsync({});
		navigate(`/chat/${chat.id}`);
	};

	return (
		<div className="flex flex-1 items-center justify-center">
			<div className="text-center">
				<div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800/50">
					<Sparkles className="h-8 w-8 text-zinc-400" />
				</div>
				<h1 className="mb-2 text-2xl font-semibold text-zinc-100">
					What can I help with?
				</h1>
				<p className="mb-8 text-sm text-zinc-500">Start a new conversation</p>
				<button
					type="button"
					onClick={handleNewChat}
					className="rounded-lg bg-zinc-100 px-6 py-3 text-sm font-medium text-zinc-900 transition-colors hover:bg-white"
					aria-label="Start a new chat"
				>
					New Chat
				</button>
			</div>
		</div>
	);
}
