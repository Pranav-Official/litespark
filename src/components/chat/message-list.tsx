import { useVirtualizer } from "@tanstack/react-virtual";
import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import MarkdownRenderer from "./markdown-renderer";
import ThinkingAccordion from "./thinking-accordion";

interface Message {
	id: string;
	role: "user" | "assistant";
	content: string;
	thinking?: string;
	model?: string;
	totalTokens?: number;
	timeTakenMs?: number;
	isStreaming?: boolean;
	images?: string[];
}

interface MessageListProps {
	messages: Message[];
	isLoading: boolean;
}

export default function MessageList({ messages, isLoading }: MessageListProps) {
	const parentRef = useRef<HTMLDivElement>(null);
	const endRef = useRef<HTMLDivElement>(null);

	const virtualizer = useVirtualizer({
		count: messages.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => 80,
		overscan: 5,
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll on messages change
	useEffect(() => {
		endRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages, isLoading]);

	if (messages.length === 0 && !isLoading) {
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
		<div ref={parentRef} className="flex-1 overflow-y-auto px-4 py-6">
			<div
				className="relative mx-auto max-w-2xl"
				style={{ height: `${virtualizer.getTotalSize()}px` }}
			>
				{virtualizer.getVirtualItems().map((virtualRow) => {
					const message = messages[virtualRow.index];
					if (!message) return null;

					const isStreaming = message.isStreaming === true;
					const hasContent = message.content.trim().length > 0;
					const hasThinking = message.thinking && message.thinking.length > 0;

					return (
						<div
							key={message.id}
							ref={virtualizer.measureElement}
							data-index={virtualRow.index}
							className={`absolute left-0 right-0 flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
							style={{
								top: 0,
								transform: `translateY(${virtualRow.start}px)`,
							}}
						>
							<div className="max-w-[80%] flex-col">
								{message.role === "assistant" && hasThinking && (
									<ThinkingAccordion
										thinking={message.thinking ?? ""}
										isStreaming={isStreaming}
									/>
								)}
								{message.images && message.images.length > 0 && (
									<div className="mb-2 flex flex-wrap gap-2">
										{message.images.map((src, i) => (
											<img
												// biome-ignore lint/suspicious/noArrayIndexKey: it's static in a message
												key={`msg-img-${message.id}-${i}`}
												src={src}
												alt={`Attachment ${i + 1}`}
												className="h-32 w-auto max-w-full rounded-xl border border-zinc-700 object-contain shadow-sm"
											/>
										))}
									</div>
								)}
								<div
									className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
										message.role === "user"
											? "bg-blue-600 text-white"
											: "bg-zinc-800 text-zinc-100"
									}`}
								>
									{isStreaming && !hasContent ? (
										<div className="flex items-center gap-2 px-1 py-1">
											<Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
											<span className="text-xs text-zinc-500 italic">
												Preparing response...
											</span>
										</div>
									) : (
										<MarkdownRenderer
											content={message.content}
											isStreaming={isStreaming}
											className={
												message.role === "user"
													? "[&_*]:text-white prose-invert"
													: "prose-zinc"
											}
										/>
									)}
								</div>
								{message.role === "assistant" &&
									!isStreaming &&
									message.model && (
										<div className="mt-1.5 flex flex-wrap gap-x-2 px-1 text-[10px] text-zinc-500 opacity-60">
											<span>{message.model}</span>
											{message.totalTokens && (
												<>
													<span>•</span>
													<span>{message.totalTokens} tokens</span>
												</>
											)}
											{message.timeTakenMs && (
												<>
													<span>•</span>
													<span>
														{(message.timeTakenMs / 1000).toFixed(1)}s
													</span>
													{message.totalTokens && (
														<>
															<span>•</span>
															<span>
																{(
																	message.totalTokens /
																	(message.timeTakenMs / 1000)
																).toFixed(1)}{" "}
																tok/s
															</span>
														</>
													)}
												</>
											)}
										</div>
									)}
							</div>
						</div>
					);
				})}
			</div>
			<div ref={endRef} />
		</div>
	);
}
