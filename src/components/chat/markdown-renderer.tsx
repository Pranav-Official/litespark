import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
	content: string;
	isStreaming?: boolean;
	className?: string;
}

export default function MarkdownRenderer({
	content,
	isStreaming,
	className = "",
}: MarkdownRendererProps) {
	return (
		<div
			className={`prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-zinc-900/50 prose-pre:border prose-pre:border-zinc-700/50 prose-code:text-zinc-200 prose-code:bg-zinc-800/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none ${className}`}
		>
			<ReactMarkdown remarkPlugins={[remarkGfm]}>
				{content + (isStreaming ? "▍" : "")}
			</ReactMarkdown>
		</div>
	);
}
