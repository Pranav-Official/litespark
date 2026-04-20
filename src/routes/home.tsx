import { Cloud, Shield, Sparkles, Zap } from "lucide-react";
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
		<div className="flex-1 overflow-y-auto">
			<div className="flex min-h-full flex-col items-center justify-center p-6 py-12 text-center md:py-20">
				<div className="mx-auto mb-8 flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-zinc-800/50 ring-1 ring-zinc-700/50 shadow-inner">
					<img
						src="/litespark.svg"
						alt="LiteSpark Logo"
						className="h-12 w-12"
					/>
				</div>

				<h1 className="mb-4 text-4xl font-bold tracking-tight text-zinc-100">
					Welcome to LiteSpark
				</h1>

				<p className="mx-auto mb-12 max-w-lg text-lg text-zinc-400">
					Your private, browser-based AI workspace. Run powerful models locally
					on your device or connect to the cloud.
				</p>

				<div className="mb-12 grid w-full max-w-4xl shrink-0 gap-6 md:grid-cols-3 md:gap-8">
					<div className="flex flex-col items-center p-6 rounded-2xl bg-zinc-900/40 ring-1 ring-zinc-800/50 transition-colors hover:bg-zinc-900/60">
						<div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
							<Shield className="h-6 w-6" />
						</div>
						<h3 className="mb-2 font-semibold text-zinc-100">
							Private & Local
						</h3>
						<p className="text-sm leading-relaxed text-zinc-500">
							Run AI entirely on your computer using WebGPU or WASM. Your data
							never leaves your browser.
						</p>
					</div>
					<div className="flex flex-col items-center p-6 rounded-2xl bg-zinc-900/40 ring-1 ring-zinc-800/50 transition-colors hover:bg-zinc-900/60">
						<div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400">
							<Cloud className="h-6 w-6" />
						</div>
						<h3 className="mb-2 font-semibold text-zinc-100">Cloud Models</h3>
						<p className="text-sm leading-relaxed text-zinc-500">
							Access the world's most capable models through OpenAI, Gemini, or
							OpenRouter with your own API key.
						</p>
					</div>
					<div className="flex flex-col items-center p-6 rounded-2xl bg-zinc-900/40 ring-1 ring-zinc-800/50 transition-colors hover:bg-zinc-900/60">
						<div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
							<Zap className="h-6 w-6" />
						</div>
						<h3 className="mb-2 font-semibold text-zinc-100">Zero Setup</h3>
						<p className="text-sm leading-relaxed text-zinc-500">
							No software to install. LiteSpark works right here in your
							browser, even when you're offline.
						</p>
					</div>
				</div>

				<div className="pb-8">
					<button
						type="button"
						onClick={handleNewChat}
						className="group flex items-center gap-2 rounded-xl bg-zinc-100 px-8 py-4 text-base font-semibold text-zinc-900 transition-all hover:bg-white hover:scale-105 active:scale-95 shadow-2xl shadow-white/10 md:relative fixed bottom-6 right-6 z-50 md:bottom-auto md:right-auto"
						aria-label="Start a new chat"
					>
						<span>New Chat</span>
						<Sparkles className="h-4 w-4 text-zinc-500 transition-colors group-hover:text-zinc-600" />
					</button>
				</div>
			</div>
		</div>
	);
}
