import { Menu, MessageSquare, Settings, Trash2, X } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useSidebar } from "#/context/sidebar-context";
import { useChats, useCreateChat, useDeleteChat } from "#/hooks/use-chats";

export default function Sidebar() {
	const { data: chats } = useChats();
	const createChat = useCreateChat();
	const deleteChat = useDeleteChat();
	const navigate = useNavigate();
	const location = useLocation();
	const { collapsed, isMobile, toggleSidebar, closeSidebar } = useSidebar();

	const handleNewChat = async () => {
		const chat = await createChat.mutateAsync({});
		navigate(`/chat/${chat.id}`);
		if (isMobile) closeSidebar();
	};

	const handleDelete = async (
		e: React.MouseEvent,
		chatId: number,
		isCurrentChat: boolean,
	) => {
		e.preventDefault();
		e.stopPropagation();
		await deleteChat.mutateAsync(chatId);
		if (isCurrentChat) {
			navigate("/");
		}
	};

	const handleNavClick = () => {
		if (isMobile) closeSidebar();
	};

	return (
		<aside
			className={
				isMobile
					? `fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-zinc-800 bg-zinc-950 transition-transform duration-300 ease-in-out ${
							collapsed ? "-translate-x-full" : "translate-x-0"
						}`
					: `flex flex-col border-r border-zinc-800 bg-zinc-950 transition-all duration-300 ease-in-out ${
							collapsed ? "w-0 overflow-hidden border-0" : "w-64"
						}`
			}
		>
			<div className="flex items-center gap-2 p-3">
				<button
					type="button"
					onClick={isMobile ? closeSidebar : toggleSidebar}
					className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
					aria-label={isMobile ? "Close sidebar" : "Toggle sidebar"}
				>
					{isMobile ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
				</button>
				<button
					type="button"
					onClick={handleNewChat}
					className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-white"
					aria-label="Create new chat"
				>
					<MessageSquare className="h-4 w-4" />
					<span className="hidden sm:inline">New Chat</span>
				</button>
			</div>

			<nav
				className="flex-1 overflow-y-auto px-2 py-1"
				aria-label="Chat history"
			>
				{chats?.map((chat) => {
					const isCurrentChat = location.pathname === `/chat/${chat.id}`;
					return (
						<Link
							key={chat.id}
							to={`/chat/${chat.id}`}
							onClick={handleNavClick}
							className={`group flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors ${
								isCurrentChat
									? "bg-zinc-800 text-zinc-100"
									: "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
							}`}
							aria-current={isCurrentChat ? "page" : undefined}
						>
							<MessageSquare className="h-4 w-4 shrink-0" />
							<span className="flex-1 truncate">{chat.title}</span>
							<button
								type="button"
								onClick={(e) => handleDelete(e, chat.id, isCurrentChat)}
								className="shrink-0 rounded p-0.5 text-zinc-500 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
								aria-label={`Delete chat: ${chat.title}`}
							>
								<Trash2 className="h-3.5 w-3.5" />
							</button>
						</Link>
					);
				})}
			</nav>

			<div className="border-t border-zinc-800 p-2">
				<Link
					to="/settings"
					onClick={handleNavClick}
					className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800/50 hover:text-zinc-200"
				>
					<Settings className="h-4 w-4" />
					Settings
				</Link>
			</div>
		</aside>
	);
}
