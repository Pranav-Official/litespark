import { ArrowUp, Brain, Square } from "lucide-react";
import { useCallback, useRef } from "react";

interface MessageInputProps {
	value: string;
	onChange: (value: string) => void;
	onSubmit: (content: string, thinking?: boolean) => void;
	onStop: () => void;
	isLoading: boolean;
	disabled?: boolean;
	thinkingEnabled?: boolean;
	onThinkingToggle?: (enabled: boolean) => void;
	showThinkingToggle?: boolean;
}

export default function MessageInput({
	value,
	onChange,
	onSubmit,
	onStop,
	isLoading,
	disabled,
	thinkingEnabled = false,
	onThinkingToggle,
	showThinkingToggle = false,
}: MessageInputProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const autoResize = useCallback(() => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
	}, []);

	const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		onChange(e.target.value);
		autoResize();
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (value.trim() && !isLoading) {
			onSubmit(value.trim(), thinkingEnabled);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			if (value.trim() && !isLoading) {
				onSubmit(value.trim(), thinkingEnabled);
			}
		}
	};

	return (
		<form onSubmit={handleSubmit} className="relative">
			{showThinkingToggle && onThinkingToggle && (
				<div className="mb-2 flex items-center justify-between">
					<button
						type="button"
						onClick={() => onThinkingToggle(!thinkingEnabled)}
						className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
							thinkingEnabled
								? "bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/30"
								: "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
						}`}
					>
						<Brain className="h-3.5 w-3.5" />
						Thinking
					</button>
				</div>
			)}
			<textarea
				ref={textareaRef}
				value={value}
				onChange={handleChange}
				onKeyDown={handleKeyDown}
				placeholder="Message..."
				rows={1}
				disabled={disabled}
				className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-800/50 px-4 py-3 pr-12 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-zinc-600 focus:bg-zinc-800 disabled:opacity-50"
			/>
			<button
				type="submit"
				disabled={(!value.trim() && !isLoading) || disabled}
				onClick={isLoading ? onStop : undefined}
				className={`absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
					isLoading
						? "bg-zinc-600 text-zinc-200 hover:bg-zinc-500"
						: value.trim()
							? "bg-zinc-100 text-zinc-900 hover:bg-white"
							: "bg-zinc-700 text-zinc-500"
				} disabled:opacity-50`}
			>
				{isLoading ? (
					<Square className="h-3.5 w-3.5" />
				) : (
					<ArrowUp className="h-4 w-4" />
				)}
			</button>
		</form>
	);
}
