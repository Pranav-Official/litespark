import {
	ArrowUp,
	Brain,
	FileText,
	ImageIcon,
	Loader2,
	Paperclip,
	Square,
	X,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
	type DocumentResult,
	isSupportedDocumentFile,
	processDocument,
} from "#/lib/document-processor";
import { processImage } from "#/lib/image-utils";

interface MessageInputProps {
	value: string;
	onChange: (value: string) => void;
	onSubmit: (
		content: string,
		thinking?: boolean,
		images?: string[],
		documents?: DocumentResult[],
	) => void;
	onStop: () => void;
	isLoading: boolean;
	disabled?: boolean;
	thinkingEnabled?: boolean;
	onThinkingToggle?: (enabled: boolean) => void;
	showThinkingToggle?: boolean;
	supportsVision?: boolean;
}

/** Returns a short human-readable label for the file type badge */
function fileTypeBadge(mimeType: string, filename: string): string {
	const ext = filename.split(".").pop()?.toUpperCase() ?? "";
	if (ext) return ext;
	if (mimeType.includes("pdf")) return "PDF";
	if (mimeType.includes("spreadsheet") || mimeType.includes("excel"))
		return "XLSX";
	if (mimeType.includes("wordprocessing") || mimeType.includes("msword"))
		return "DOCX";
	return "DOC";
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
	const imageInputRef = useRef<HTMLInputElement>(null);
	const docInputRef = useRef<HTMLInputElement>(null);

	const [attachments, setAttachments] = useState<string[]>([]);
	const [documents, setDocuments] = useState<DocumentResult[]>([]);
	const [isProcessingDoc, setIsProcessingDoc] = useState(false);

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

	// ---------------------------------------------------------------------------
	// Image handling (unchanged behaviour)
	// ---------------------------------------------------------------------------

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

	const handleImageFileChange = async (
		e: React.ChangeEvent<HTMLInputElement>,
	) => {
		const files = Array.from(e.target.files || []);
		for (const file of files) {
			await handleImageProcess(file);
		}
		if (imageInputRef.current) imageInputRef.current.value = "";
	};

	const handlePaste = async (e: React.ClipboardEvent) => {
		const items = Array.from(e.clipboardData.items);
		const imageItems = items.filter((item) => item.type.startsWith("image/"));
		if (imageItems.length > 0) {
			e.preventDefault();
			for (const item of imageItems) {
				const file = item.getAsFile();
				if (file) await handleImageProcess(file);
			}
		}
	};

	const removeAttachment = (index: number) => {
		setAttachments((prev) => prev.filter((_, i) => i !== index));
	};

	// ---------------------------------------------------------------------------
	// Document handling
	// ---------------------------------------------------------------------------

	const handleDocumentFileChange = async (
		e: React.ChangeEvent<HTMLInputElement>,
	) => {
		const files = Array.from(e.target.files || []);
		if (docInputRef.current) docInputRef.current.value = "";

		const unsupported = files.filter((f) => !isSupportedDocumentFile(f));
		if (unsupported.length > 0) {
			toast.error(
				`Unsupported file type: ${unsupported.map((f) => f.name).join(", ")}`,
			);
			return;
		}

		setIsProcessingDoc(true);
		const modality = supportsVision ? "multimodal" : "text";

		try {
			const results: DocumentResult[] = [];
			for (const file of files) {
				try {
					const result = await processDocument(file, modality);
					results.push(result);
				} catch (err) {
					toast.error(`Failed to process ${file.name}`);
					console.error(err);
				}
			}
			if (results.length > 0) {
				setDocuments((prev) => [...prev, ...results]);
			}
		} finally {
			setIsProcessingDoc(false);
		}
	};

	const removeDocument = (index: number) => {
		setDocuments((prev) => prev.filter((_, i) => i !== index));
	};

	// ---------------------------------------------------------------------------
	// Submit
	// ---------------------------------------------------------------------------

	const hasContent =
		value.trim().length > 0 || attachments.length > 0 || documents.length > 0;

	const doSubmit = () => {
		if (!hasContent || isLoading) return;
		onSubmit(
			value.trim(),
			thinkingEnabled,
			attachments.length > 0 ? attachments : undefined,
			documents.length > 0 ? documents : undefined,
		);
		setAttachments([]);
		setDocuments([]);
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		doSubmit();
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			doSubmit();
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
				{/* ── Attachment preview strip ── */}
				{(attachments.length > 0 || documents.length > 0) && (
					<div className="flex flex-wrap gap-2 p-3 pb-0">
						{/* Image thumbnails */}
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

						{/* Document chips */}
						{documents.map((doc, idx) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: small list
								key={doc.filename + idx}
								className="group flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 max-w-[220px]"
							>
								<FileText className="h-4 w-4 shrink-0 text-zinc-400" />
								<div className="min-w-0 flex-1">
									<p className="truncate text-xs text-zinc-200 leading-tight">
										{doc.filename}
									</p>
									<p className="text-[10px] text-zinc-500 leading-tight">
										{fileTypeBadge(doc.mimeType, doc.filename)}
										{doc.images && doc.images.length > 0
											? ` · ${doc.images.length} page${doc.images.length === 1 ? "" : "s"} as images`
											: doc.text
												? ` · ${Math.round(doc.text.length / 4)} tokens est.`
												: ""}
									</p>
								</div>
								<button
									type="button"
									onClick={() => removeDocument(idx)}
									className="shrink-0 flex h-4 w-4 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
								>
									<X className="h-3 w-3" />
								</button>
							</div>
						))}

						{/* Processing spinner */}
						{isProcessingDoc && (
							<div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5">
								<Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
								<span className="text-xs text-zinc-400">Processing…</span>
							</div>
						)}
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
					className="w-full resize-none bg-transparent px-4 py-3 pr-[7rem] text-sm text-zinc-100 placeholder-zinc-500 outline-none disabled:opacity-50"
					aria-label="Message input"
				/>

				<div className="absolute bottom-2 right-2 flex items-center gap-1">
					{/* Hidden image file input */}
					<input
						type="file"
						ref={imageInputRef}
						onChange={handleImageFileChange}
						accept="image/*"
						multiple
						className="hidden"
					/>
					{/* Hidden document file input */}
					<input
						type="file"
						ref={docInputRef}
						onChange={handleDocumentFileChange}
						accept=".pdf,.txt,.md,.xlsx,.xls,.doc,.docx"
						multiple
						className="hidden"
					/>

					{/* Image attach button */}
					<button
						type="button"
						onClick={() => imageInputRef.current?.click()}
						disabled={disabled || !supportsVision}
						className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-50 disabled:pointer-events-none"
						title={
							supportsVision ? "Attach image" : "Model does not support images"
						}
					>
						<ImageIcon className="h-4 w-4" />
					</button>

					{/* Document attach button */}
					<button
						type="button"
						onClick={() => docInputRef.current?.click()}
						disabled={disabled || isProcessingDoc}
						className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-50 disabled:pointer-events-none"
						title="Attach document (PDF, DOCX, XLSX, TXT, MD)"
					>
						<Paperclip className="h-4 w-4" />
					</button>

					{/* Send / Stop button */}
					<button
						type="submit"
						disabled={(!hasContent && !isLoading) || disabled}
						onClick={isLoading ? onStop : undefined}
						className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
							isLoading
								? "bg-zinc-600 text-zinc-200 hover:bg-zinc-500"
								: hasContent
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
