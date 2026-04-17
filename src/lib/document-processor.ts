/**
 * document-processor.ts
 *
 * Converts user-uploaded files into text and/or image data that can be
 * injected into LLM messages.  Supported formats:
 *   Text / Markdown  – read as-is
 *   PDF              – text extraction (all models) + page rendering (VLMs)
 *   XLSX / XLS       – SheetJS → markdown table
 *   DOC / DOCX       – mammoth → plain text
 */

export interface DocumentResult {
	/** Original filename */
	filename: string;
	/** MIME type of the source file */
	mimeType: string;
	/** Original file size in bytes */
	size: number;
	/** Extracted plain text (always populated when possible) */
	text?: string;
	/** Base64 PNG data-URLs for PDF pages (populated for VLMs) */
	images?: string[];
}

/** Maximum PDF pages to render as images when using a VLM */
const DEFAULT_MAX_PDF_PAGES = 10;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Process a single File into a DocumentResult.
 *
 * @param file      The File object from an <input type="file"> or drag-drop.
 * @param modality  "multimodal" → also render PDF pages as images.
 * @param maxPdfPages  Cap for VLM page rendering (default 10).
 */
export async function processDocument(
	file: File,
	modality: "text" | "multimodal" = "text",
	maxPdfPages = DEFAULT_MAX_PDF_PAGES,
): Promise<DocumentResult> {
	const name = file.name;
	const ext = name.split(".").pop()?.toLowerCase() ?? "";
	const mime = file.type || guessMime(ext);

	if (
		ext === "txt" ||
		ext === "md" ||
		mime === "text/plain" ||
		mime === "text/markdown"
	) {
		return processText(file, name, mime);
	}

	if (ext === "pdf" || mime === "application/pdf") {
		return processPdf(file, name, mime, modality, maxPdfPages);
	}

	if (
		ext === "xlsx" ||
		ext === "xls" ||
		mime.includes("spreadsheet") ||
		mime.includes("excel")
	) {
		return processXlsx(file, name, mime);
	}

	if (
		ext === "docx" ||
		ext === "doc" ||
		mime ===
			"application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
		mime === "application/msword"
	) {
		return processDocx(file, name, mime);
	}

	// Unknown format: attempt plain text read
	try {
		return await processText(file, name, mime);
	} catch {
		throw new Error(`Unsupported file format: ${name}`);
	}
}

// ---------------------------------------------------------------------------
// Format handlers
// ---------------------------------------------------------------------------

async function processText(
	file: File,
	filename: string,
	mimeType: string,
): Promise<DocumentResult> {
	const text = await file.text();
	return { filename, mimeType, size: file.size, text };
}

async function processXlsx(
	file: File,
	filename: string,
	mimeType: string,
): Promise<DocumentResult> {
	const { read, utils } = await import("xlsx");
	const buf = await file.arrayBuffer();
	const workbook = read(buf, { type: "array" });

	const sections: string[] = [];
	for (const sheetName of workbook.SheetNames) {
		const sheet = workbook.Sheets[sheetName];
		const rows: string[][] = utils.sheet_to_json(sheet, {
			header: 1,
			defval: "",
			raw: false,
		}) as string[][];

		const nonEmpty = rows.filter((r) => r.some((c) => String(c).trim() !== ""));
		if (nonEmpty.length === 0) continue;

		// Escape pipe characters inside cell values to avoid corrupting markdown table syntax
		const escapeCell = (val: unknown) =>
			String(val ?? "").replace(/\|/g, "\\|");

		const cols = Math.max(...nonEmpty.map((r) => r.length));
		const pad = (r: string[]) =>
			Array.from({ length: cols }, (_, i) => escapeCell(r[i] ?? ""));

		const header = pad(nonEmpty[0]).join(" | ");
		const separator = Array(cols).fill("---").join(" | ");
		const tableRows = [
			`| ${header} |`,
			`| ${separator} |`,
			...nonEmpty.slice(1).map((r) => `| ${pad(r).join(" | ")} |`),
		];
		sections.push(`### Sheet: ${sheetName}\n\n${tableRows.join("\n")}`);
	}

	return {
		filename,
		mimeType,
		text: sections.join("\n\n") || "(empty spreadsheet)",
		size: file.size,
	};
}

async function processDocx(
	file: File,
	filename: string,
	mimeType: string,
): Promise<DocumentResult> {
	const mammoth = await import("mammoth");
	const buf = await file.arrayBuffer();
	const result = await mammoth.extractRawText({ arrayBuffer: buf });
	return {
		filename,
		mimeType,
		size: file.size,
		text: result.value || "(empty document)",
	};
}

async function processPdf(
	file: File,
	filename: string,
	mimeType: string,
	modality: "text" | "multimodal",
	maxPdfPages: number,
): Promise<DocumentResult> {
	// Lazy-load pdfjs-dist so it only bundles when needed
	const pdfjsLib = await import("pdfjs-dist");

	// Import the worker as a local asset URL (Vite resolves this at build time –
	// no CDN, fully offline).
	if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
		const { default: workerUrl } = await import(
			"pdfjs-dist/build/pdf.worker.min.mjs?url"
		);
		pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
	}

	const buf = await file.arrayBuffer();
	const loadingTask = pdfjsLib.getDocument({ data: buf });
	const pdf = await loadingTask.promise;

	const totalPages = pdf.numPages;
	const pagesToProcess = Math.min(totalPages, maxPdfPages);

	// Always extract text
	const textParts: string[] = [];
	for (let i = 1; i <= pagesToProcess; i++) {
		const page = await pdf.getPage(i);
		const content = await page.getTextContent();
		const pageText = content.items
			.map((item: any) => ("str" in item ? item.str : ""))
			.join(" ")
			.replace(/\s{2,}/g, " ")
			.trim();
		if (pageText) textParts.push(`[Page ${i}]\n${pageText}`);
	}

	if (totalPages > pagesToProcess) {
		textParts.push(
			`\n[Note: Document has ${totalPages} pages. Only the first ${pagesToProcess} pages were processed.]`,
		);
	}

	const text = textParts.join("\n\n");

	// For VLMs: also render pages to canvas → base64 PNG
	let images: string[] | undefined;
	if (modality === "multimodal") {
		images = [];
		for (let i = 1; i <= pagesToProcess; i++) {
			const page = await pdf.getPage(i);
			const viewport = page.getViewport({ scale: 1.5 });

			const canvas = document.createElement("canvas");
			canvas.width = viewport.width;
			canvas.height = viewport.height;
			const ctx = canvas.getContext("2d")!;

			await page.render({ canvasContext: ctx, canvas, viewport }).promise;
			images.push(canvas.toDataURL("image/png"));
		}
	}

	return { filename, mimeType, size: file.size, text, images };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function guessMime(ext: string): string {
	const map: Record<string, string> = {
		txt: "text/plain",
		md: "text/markdown",
		pdf: "application/pdf",
		xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		xls: "application/vnd.ms-excel",
		docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		doc: "application/msword",
	};
	return map[ext] ?? "application/octet-stream";
}

/**
 * Returns true if the file extension is one we support.
 */
export function isSupportedDocumentFile(file: File): boolean {
	const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
	return ["txt", "md", "pdf", "xlsx", "xls", "doc", "docx"].includes(ext);
}

/**
 * Human-readable label for an attachment chip.
 */
export function documentFileLabel(file: File): string {
	const ext = file.name.split(".").pop()?.toUpperCase() ?? "FILE";
	const kb = Math.round(file.size / 1024);
	return `${file.name} (${ext}, ${kb} KB)`;
}
