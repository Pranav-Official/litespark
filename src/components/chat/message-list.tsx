import { useVirtualizer } from "@tanstack/react-virtual";
import { FileText, Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import MarkdownRenderer from "./markdown-renderer";
import ThinkingAccordion from "./thinking-accordion";

interface AttachmentMeta {
	name: string;
	type: string;
	size: number;
}

interface Message {
	id: string;
	role: "user" | "assistant" | "document";
	content: string;
	thinking?: string;
	model?: string;
	totalTokens?: number;
	timeTakenMs?: number;
	isStreaming?: boolean;
	images?: string[];
	attachments?: AttachmentMeta[];
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
							{message.role === "document" ? (
								<div className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-400">
									<FileText className="h-4 w-4 shrink-0 text-zinc-500" />
									<span className="max-w-[240px] truncate font-medium text-zinc-300">
										{message.attachments?.[0]?.name ??
											message.content
												.split("\n")[0]
												.replace("[Document: ", "")
												.replace("]", "")}
									</span>
									<span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">
										{message.attachments?.[0]?.type
											?.split("/")
											.pop()
											?.toUpperCase() ?? "DOC"}
									</span>
								</div>
							) : (
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
									{message.attachments && message.attachments.length > 0 && (
										<div className="mb-2 flex flex-wrap gap-1.5">
											{message.attachments.map((att, i) => (
												<div
													// biome-ignore lint/suspicious/noArrayIndexKey: static
													key={`att-${message.id}-${i}`}
													className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900/80 px-2 py-1"
												>
													<FileText className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
													<span className="max-w-[160px] truncate text-[11px] text-zinc-300">
														{att.name}
													</span>
												</div>
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
							)}
						</div>
					);
				})}
			</div>
			<div ref={endRef} />
		</div>
	);
}
