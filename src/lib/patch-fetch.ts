// Patch global fetch before any other imports to ensure libraries capture the patched version
const originalFetch = globalThis.fetch;

// Helper to get stored repo files for a model ID
const getPathMap = (modelId: string): Record<string, string> | null => {
	const globalMaps = (window as any).__LITESPARK_PATH_MAPS__;
	if (globalMaps?.[modelId]) return globalMaps[modelId];

	try {
		const stored = localStorage.getItem(`path_map_${modelId}`);
		if (stored) return JSON.parse(stored);
	} catch (_e) {}
	return null;
};

globalThis.fetch = async (url: RequestInfo | URL, options?: RequestInit) => {
	let urlStr: string;
	let isRequest = false;

	if (typeof url === "string") {
		urlStr = url;
	} else if (url instanceof URL) {
		urlStr = url.toString();
	} else {
		urlStr = (url as Request).url;
		isRequest = true;
	}

	// Only intercept Hugging Face resolve requests
	if (urlStr.includes("huggingface.co") && urlStr.includes("/resolve/")) {
		const parts = urlStr.split("/resolve/main/");
		if (parts.length === 2) {
			const baseUrl = `${parts[0]}/resolve/main/`;
			const requestedFile = parts[1];
			const modelId = parts[0].split("huggingface.co/")[1];

			const pathMap = getPathMap(modelId);
			if (pathMap) {
				let matchedPath: string | null = null;

				const requestedFileName =
					requestedFile.split("/").pop() || requestedFile;

				// 1. Direct match
				if (pathMap[requestedFileName]) {
					matchedPath = pathMap[requestedFileName];
				}

				// 2. Suffix-aware match
				if (!matchedPath && requestedFileName.endsWith(".onnx")) {
					const nameWithoutExt = requestedFileName.replace(".onnx", "");
					const baseName = nameWithoutExt.replace(
						/(_q4|_q4f16|_q8|_int8|_uint8|_fp16|_fp32|_bnb4|_quantized)$/,
						"",
					);

					const logicalName = `${baseName}.onnx`;
					if (pathMap[logicalName]) {
						matchedPath = pathMap[logicalName];
					}
				}

				// 3. Special case for .onnx_data files
				if (!matchedPath && requestedFileName.includes(".onnx_")) {
					const [namePart] = requestedFileName.split(".onnx");
					const dataSuffix = requestedFileName.substring(
						requestedFileName.indexOf(".onnx") + 5,
					);

					const baseName = namePart.replace(
						/(_q4|_q4f16|_q8|_int8|_uint8|_fp16|_fp32|_bnb4|_quantized)$/,
						"",
					);

					const logicalName = `${baseName}.onnx`;
					if (pathMap[logicalName]) {
						const onnxPath = pathMap[logicalName];
						const folder = onnxPath.includes("/")
							? onnxPath.substring(0, onnxPath.lastIndexOf("/"))
							: "";
						const normalizedSuffix = dataSuffix.replace(/^_+/, "_");
						const fileName = `${onnxPath.split("/").pop()}${normalizedSuffix}`;
						matchedPath = folder ? `${folder}/${fileName}` : fileName;
					}
				}

				// 4. "Zero-404" Firewall Check
				// If it's an .onnx or .onnx_data file and we still haven't found a match in the pathMap,
				// and we HAVE a pathMap, it means the library is speculatively guessing a file that doesn't exist.
				// We instantly block it to keep the network tab clean.
				if (
					!matchedPath &&
					(requestedFile.includes(".onnx") ||
						requestedFile.includes("gen_head") ||
						requestedFile.includes("language_model"))
				) {
					console.log(
						`[LiteSpark] Firewall Blocked speculative fetch: ${requestedFile}`,
					);
					return new Response(null, {
						status: 404,
						statusText: "Not Found (Blocked by LiteSpark Manifest Firewall)",
					});
				}

				if (matchedPath) {
					const newUrl = baseUrl + matchedPath;
					if (newUrl !== urlStr) {
						console.log(
							`[LiteSpark] Redirecting ${requestedFile} -> ${matchedPath}`,
						);
						const reqToUse = isRequest
							? new Request(newUrl, (url as Request).clone())
							: newUrl;
						return originalFetch(reqToUse, options);
					}
				}
			}
		}
	}

	return originalFetch(url, options);
};

export {};
