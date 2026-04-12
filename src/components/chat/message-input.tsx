import { ArrowUp, Brain, ImageIcon, Square, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { processImage } from "#/lib/image-utils";

interface MessageInputProps {
	value: string;
	onChange: (value: string) => void;
	onSubmit: (content: string, thinking?: boolean, images?: string[]) => void;
	onStop: () => void;
	isLoading: boolean;
	disabled?: boolean;
	thinkingEnabled?: boolean;
	onThinkingToggle?: (enabled: boolean) => void;
	showThinkingToggle?: boolean;
	supportsVision?: boolean;
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
	supportsVision = false,
}: MessageInputProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [attachments, setAttachments] = useState<string[]>([]);

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

	const handleImageProcess = async (file: File) => {
		if (!supportsVision) {
			toast.error("This model does not support image attachments.");
			return;
		}
		if (attachments.length >= 4) {
			toast.error("You can only attach up to 4 images.");
			return;
		}

		if (!file.type.startsWith("image/")) {
			toast.error("Only image files are supported.");
			return;
		}

		try {
			const base64 = await processImage(file);
			setAttachments((prev) => [...prev, base64].slice(0, 4));
		} catch (err) {
			toast.error("Failed to process image.");
			console.error(err);
		}
	};

	const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(e.target.files || []);
		for (const file of files) {
			await handleImageProcess(file);
		}
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	};

	const handlePaste = async (e: React.ClipboardEvent) => {
		const items = Array.from(e.clipboardData.items);
		const imageItems = items.filter((item) => item.type.startsWith("image/"));

		if (imageItems.length > 0) {
			e.preventDefault();
			for (const item of imageItems) {
				const file = item.getAsFile();
				if (file) {
					await handleImageProcess(file);
				}
			}
		}
	};

	const removeAttachment = (index: number) => {
		setAttachments((prev) => prev.filter((_, i) => i !== index));
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if ((value.trim() || attachments.length > 0) && !isLoading) {
			onSubmit(value.trim(), thinkingEnabled, attachments);
			setAttachments([]);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			if ((value.trim() || attachments.length > 0) && !isLoading) {
				onSubmit(value.trim(), thinkingEnabled, attachments);
				setAttachments([]);
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
						aria-pressed={thinkingEnabled}
						aria-label="Toggle thinking mode"
					>
						<Brain className="h-3.5 w-3.5" />
						Thinking
					</button>
				</div>
			)}

			<div className="relative rounded-2xl border border-zinc-700 bg-zinc-800/50 shadow-sm focus-within:border-zinc-500 focus-within:bg-zinc-800 transition-colors">
				{attachments.length > 0 && (
					<div className="flex flex-wrap gap-2 p-3 pb-0">
						{attachments.map((src, idx) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: attachments are small and mostly unique
								key={src.substring(0, 50) + idx}
								className="group relative h-16 w-16 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900"
							>
								<img
									src={src}
									alt={`Attachment ${idx + 1}`}
									className="h-full w-full object-cover"
								/>
								<button
									type="button"
									onClick={() => removeAttachment(idx)}
									className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black"
								>
									<X className="h-3 w-3" />
								</button>
							</div>
						))}
					</div>
				)}

				<textarea
					ref={textareaRef}
					value={value}
					onChange={handleChange}
					onKeyDown={handleKeyDown}
					onPaste={handlePaste}
					placeholder="Message..."
					rows={1}
					disabled={disabled}
					className="w-full resize-none bg-transparent px-4 py-3 pr-[5.5rem] text-sm text-zinc-100 placeholder-zinc-500 outline-none disabled:opacity-50"
					aria-label="Message input"
				/>

				<div className="absolute bottom-2 right-2 flex items-center gap-1">
					<input
						type="file"
						ref={fileInputRef}
						onChange={handleFileChange}
						accept="image/*"
						multiple
						className="hidden"
					/>
					<button
						type="button"
						onClick={() => fileInputRef.current?.click()}
						disabled={disabled || !supportsVision}
						className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-50 disabled:pointer-events-none"
						title={
							supportsVision ? "Attach image" : "Model does not support images"
						}
					>
						<ImageIcon className="h-4 w-4" />
					</button>
					<button
						type="submit"
						disabled={
							(!value.trim() && attachments.length === 0 && !isLoading) ||
							disabled
						}
						onClick={isLoading ? onStop : undefined}
						className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
							isLoading
								? "bg-zinc-600 text-zinc-200 hover:bg-zinc-500"
								: value.trim() || attachments.length > 0
									? "bg-zinc-100 text-zinc-900 hover:bg-white"
									: "bg-zinc-700 text-zinc-500"
						} disabled:opacity-50`}
						aria-label={isLoading ? "Stop generating" : "Send message"}
					>
						{isLoading ? (
							<Square className="h-3.5 w-3.5" />
						) : (
							<ArrowUp className="h-4 w-4" />
						)}
					</button>
				</div>
			</div>
		</form>
	);
}
