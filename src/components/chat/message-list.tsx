import { Loader2 } from "lucide-react";
import { useCallback, useRef } from "react";

interface Message {
	id: string;
	role: "user" | "assistant";
	content: string;
}

interface MessageListProps {
	messages: Message[];
	isLoading: boolean;
}

export default function MessageList({ messages, isLoading }: MessageListProps) {
	const scrollRef = useRef<HTMLDivElement>(null);

	const autoScroll = useCallback((el: HTMLDivElement | null) => {
		el?.scrollIntoView({ behavior: "smooth" });
	}, []);

	if (messages.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center">
				<div className="text-center">
					<p className="text-lg font-medium text-zinc-300">
						Start a conversation
					</p>
					<p className="mt-1 text-sm text-zinc-500">Send a message to begin</p>
				</div>
			</div>
		);
	}

	return (
		<div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
			<div className="mx-auto max-w-2xl space-y-6">
				{messages.map((message) => (
					<div
						key={message.id}
						className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
					>
						<div
							className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
								message.role === "user"
									? "bg-blue-600 text-white"
									: "bg-zinc-800 text-zinc-100"
							}`}
						>
							<p className="whitespace-pre-wrap">{message.content}</p>
						</div>
					</div>
				))}

				{isLoading && (
					<div className="flex justify-start">
						<div className="rounded-2xl bg-zinc-800 px-4 py-3">
							<Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
						</div>
					</div>
				)}

				<div ref={autoScroll} />
			</div>
		</div>
	);
}
