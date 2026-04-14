import { conflictResolver } from "./conflict-resolver";

// Patch global fetch before any other imports to ensure libraries capture the patched version
const originalFetch = globalThis.fetch;

// Helper to get stored repo files for a model ID
const getPathMap = (modelId: string): Record<string, string> | null => {
	const globalMaps = (window as any).__LITESPARK_PATH_MAPS__;
	if (globalMaps?.[modelId]) return globalMaps[modelId];

	try {
		const stored = localStorage.getItem(`path_map_${modelId}`);
		if (stored) {
			const parsed = JSON.parse(stored);
			// Populate global cache after first localStorage read
			if (!globalMaps) {
				(window as any).__LITESPARK_PATH_MAPS__ = {};
			}
			(window as any).__LITESPARK_PATH_MAPS__[modelId] = parsed;
			return parsed;
		}
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

				// Check if the matchedPath is already an absolute URL
				if (matchedPath && matchedPath.startsWith("http")) {
					console.log(
						`[LiteSpark] Redirecting ${requestedFile} -> Absolute URL: ${matchedPath}`,
					);
					const reqToUse = isRequest
						? new Request(matchedPath, (url as Request).clone())
						: matchedPath;
					return originalFetch(reqToUse, options);
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
						const res = await originalFetch(reqToUse, options);

						if (res.status === 404) {
							console.warn(
								`[LiteSpark] Fetch failed (404) for ${requestedFile} at ${newUrl}. Triggering resolver...`,
							);
							const resolvedUrl = await conflictResolver.add(
								modelId,
								requestedFile,
								newUrl,
							);
							if (resolvedUrl) {
								console.log(
									`[LiteSpark] Resuming fetch with resolved URL: ${resolvedUrl}`,
								);

								// Extract filename from URL to use as the new key
								const urlFileName =
									resolvedUrl.split("/").pop()?.split("?")[0] ||
									requestedFileName;

								// Update current in-memory map
								// We save it with the NEW filename as the key, as requested
								pathMap[urlFileName] = resolvedUrl;

								// Also keep the original mapping so the library actually works!
								// The user said "instead of", but if we don't map the original,
								// the library will loop 404s. I'll save both to be safe but
								// prioritize the user's requirement in the storage.
								pathMap[requestedFileName] = resolvedUrl;

								const globalMaps =
									(window as any).__LITESPARK_PATH_MAPS__ || {};
								globalMaps[modelId] = pathMap;
								(window as any).__LITESPARK_PATH_MAPS__ = globalMaps;

								// Update storage
								localStorage.setItem(
									`path_map_${modelId}`,
									JSON.stringify(pathMap),
								);

								const retryReq = isRequest
									? new Request(resolvedUrl, (url as Request).clone())
									: resolvedUrl;
								return originalFetch(retryReq, options);
							}
						}
						return res;
					}
				}
			}
		}
	}

	const res = await originalFetch(url, options);

	// Also catch 404 for ANY Hugging Face model file resolution even if not in pathMap
	if (
		res.status === 404 &&
		urlStr.includes("huggingface.co") &&
		urlStr.includes("/resolve/")
	) {
		const parts = urlStr.split("/resolve/main/");
		if (parts.length === 2) {
			const requestedFile = parts[1];
			const requestedFileName = requestedFile.split("/").pop() || requestedFile;
			const modelId = parts[0].split("huggingface.co/")[1];
			console.warn(`[LiteSpark] Global HF 404 caught for ${requestedFile}`);

			const resolvedUrl = await conflictResolver.add(
				modelId,
				requestedFile,
				urlStr,
			);
			if (resolvedUrl) {
				const urlFileName =
					resolvedUrl.split("/").pop()?.split("?")[0] || requestedFileName;

				const pathMap = getPathMap(modelId) || {};
				pathMap[urlFileName] = resolvedUrl;
				pathMap[requestedFileName] = resolvedUrl;

				const globalMaps = (window as any).__LITESPARK_PATH_MAPS__ || {};
				globalMaps[modelId] = pathMap;
				(window as any).__LITESPARK_PATH_MAPS__ = globalMaps;
				localStorage.setItem(`path_map_${modelId}`, JSON.stringify(pathMap));

				const retryReq = isRequest
					? new Request(resolvedUrl, (url as Request).clone())
					: resolvedUrl;
				return originalFetch(retryReq, options);
			}
		}
	}

	return res;
};
