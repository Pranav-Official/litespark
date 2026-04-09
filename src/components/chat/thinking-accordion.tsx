import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import MarkdownRenderer from "./markdown-renderer";

interface ThinkingAccordionProps {
	thinking: string;
	isStreaming?: boolean;
}

export default function ThinkingAccordion({
	thinking,
	isStreaming,
}: ThinkingAccordionProps) {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<div className="mb-2 overflow-hidden rounded-xl border border-zinc-700/50 bg-zinc-800/30">
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-zinc-800/50"
			>
				{isStreaming && !thinking ? (
					<Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
				) : (
					<Sparkles className="h-3.5 w-3.5 text-zinc-500" />
				)}
				<span className="flex-1 text-xs font-medium text-zinc-400">
					{isStreaming && !thinking
						? "Thinking..."
						: `Thought for ${thinking.length > 100 ? "a while" : "a moment"}`}
				</span>
				<ChevronDown
					className={`h-3.5 w-3.5 text-zinc-500 transition-transform duration-200 ${
						isOpen ? "rotate-180" : ""
					}`}
				/>
			</button>
			{isOpen && (
				<div className="border-t border-zinc-700/50 px-4 py-3">
					<MarkdownRenderer
						content={thinking}
						isStreaming={isStreaming}
						className="text-xs text-zinc-400 opacity-80"
					/>
				</div>
			)}
		</div>
	);
}
