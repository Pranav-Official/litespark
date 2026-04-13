import {
	ArrowLeft,
	Check,
	ChevronDown,
	Cpu,
	Download,
	Eye,
	EyeOff,
	Loader2,
	Trash2,
	WifiOff,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { useCreateModel, useLocalLLM } from "#/hooks/use-local-llm";
import { useActiveProvider, useUpdateSetting } from "#/hooks/use-settings";
import type { DtypeValue, ModelClass, ModelConfig } from "#/lib/model-registry";

const QUANT_FALLBACKS: Record<string, string[]> = {
	q4: ["q4", "q4f16", "int8", "q8", "fp16", "fp32"],
	q4f16: ["q4f16", "q4", "int8", "q8", "fp16", "fp32"],
	q8: ["q8", "int8", "q4f16", "q4", "fp16", "fp32"],
	int8: ["int8", "q8", "q4f16", "q4", "fp16", "fp32"],
	fp16: ["fp16", "fp32", "q8", "q4f16", "q4"],
	fp32: ["fp32", "fp16", "q8", "q4f16", "q4"],
	auto: ["auto"],
};

const resolveDtypeFallback = (
	desiredDtype: string,
	parts: Record<string, string[]>,
	isFp16Supported: boolean,
): Record<string, DtypeValue> => {
	const resolved: Record<string, DtypeValue> = {};
	let fallbacks = QUANT_FALLBACKS[desiredDtype] || [
		desiredDtype,
		"fp32",
		"fp16",
		"q4",
		"q8",
	];

	// Filter out fp16-dependent dtypes if not supported
	if (!isFp16Supported) {
		fallbacks = fallbacks.filter((f) => f !== "fp16" && f !== "q4f16");
	}

	for (const [part, availableQuants] of Object.entries(parts)) {
		let selectedQuant = "fp32";

		for (const fb of fallbacks) {
			if (fb === "auto") {
				const hasQ4f16 = isFp16Supported && availableQuants.includes("q4f16");
				const hasFp16 = isFp16Supported && availableQuants.includes("fp16");

				selectedQuant = hasQ4f16
					? "q4f16"
					: availableQuants.includes("q4")
						? "q4"
						: hasFp16
							? "fp16"
							: availableQuants.includes("q8")
								? "q8"
								: "fp32";
				break;
			} else if (availableQuants.includes(fb)) {
				selectedQuant = fb;
				break;
			}
		}
		resolved[part] = selectedQuant as DtypeValue;
	}
	return resolved;
};

const PROVIDERS = [
	{ id: "openai", name: "OpenAI", defaultModel: "gpt-4o" },
	{ id: "gemini", name: "Gemini", defaultModel: "gemini-2.5-flash" },
	{ id: "openrouter", name: "OpenRouter", defaultModel: "openai/gpt-4o" },
];

const STATUS_LABELS: Record<string, { text: string; color: string }> = {
	idle: { text: "Not Downloaded", color: "text-zinc-500" },
	downloading: { text: "Downloading", color: "text-blue-400" },
	downloaded: { text: "Downloaded", color: "text-zinc-400" },
	loading: { text: "Loading", color: "text-amber-400" },
	ready: { text: "Ready", color: "text-emerald-400" },
	error: { text: "Error", color: "text-red-400" },
};

interface AddModelFormData {
	modelId: string;
	name: string;
	dtype: DtypeValue;
	modelClass: ModelClass;
	modality: "text" | "multimodal";
	supportsThinking: boolean;
	thinkingFormat: "qwen" | "gemma" | "custom";
	customStartTag: string;
	customEndTag: string;
	customSuffix: string;
}

export default function SettingsPage() {
	const navigate = useNavigate();
	const { provider, apiKey, model } = useActiveProvider();
	const updateSetting = useUpdateSetting();
	const {
		info,
		load,
		unload,
		deleteModel,
		setInferenceMode,
		isLocal,
		device,
		setDevice,
		hasWebGPU,
		activeModel,
		setActiveModel,
		availableModels,
		cachedModelIds,
	} = useLocalLLM();

	const [selectedProvider, setSelectedProvider] = useState(provider);
	const [key, setKey] = useState(apiKey);
	const [selectedModel, setSelectedModel] = useState(model);
	const [showKey, setShowKey] = useState(false);
	const [showProviderDropdown, setShowProviderDropdown] = useState(false);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [loadingModel, setLoadingModel] = useState(false);
	const [unloadingModel, setUnloadingModel] = useState(false);
	const [deletingModelId, setDeletingModelId] = useState<string | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [isFp16Supported, setIsFp16Supported] = useState(true);

	// New model form state
	const [showAddForm, setShowAddForm] = useState(false);

	const { register, handleSubmit, watch, setValue, reset, control } =
		useForm<AddModelFormData>({
			defaultValues: {
				modelId: "",
				name: "",
				dtype: "q4f16",
				modelClass: "Qwen3_5",
				modality: "text",
				supportsThinking: false,
				thinkingFormat: "qwen",
				customStartTag: "<think>",
				customEndTag: "</think>",
				customSuffix: "",
			},
		});

	const watchedModelId = watch("modelId");
	const watchedDtype = watch("dtype");
	const watchedSupportsThinking = watch("supportsThinking");
	const watchedThinkingFormat = watch("thinkingFormat");

	const createModel = useCreateModel();

	const [isFetchingFiles, setIsFetchingFiles] = useState(false);
	const [fetchedParts, setFetchedParts] = useState<Record<
		string,
		string[]
	> | null>(null);
	const [fetchMessage, setFetchMessage] = useState<{
		text: string;
		type: "error" | "success";
	} | null>(null);
	const [detectedArch, setDetectedArch] = useState<string | null>(null);
	const [rawPathMap, setRawPathMap] = useState<Record<
		string,
		Record<string, string>
	> | null>(null);
	const [repoFiles, setRepoFiles] = useState<string[] | null>(null);

	const resetScanState = useCallback(() => {
		setFetchedParts(null);
		setFetchMessage(null);
		setDetectedArch(null);
		setRawPathMap(null);
		setRepoFiles(null);
	}, []);

	// Reset scan state when ID changes
	useEffect(() => {
		void watchedModelId;
		resetScanState();
	}, [watchedModelId, resetScanState]);

	useEffect(() => {
		const checkFp16 = async () => {
			const nav = navigator as any;
			if (!nav.gpu) {
				setIsFp16Supported(false);
				return;
			}
			try {
				const adapter = await nav.gpu.requestAdapter();
				if (adapter) {
					const supported = adapter.features.has("shader-f16");
					setIsFp16Supported(supported);
				}
			} catch (e) {
				setIsFp16Supported(false);
			}
		};
		checkFp16();
	}, []);

	useEffect(() => {
		if (
			!isFp16Supported &&
			(watchedDtype === "q4f16" || watchedDtype === "fp16")
		) {
			setValue("dtype", "q4");
		}
	}, [isFp16Supported, watchedDtype, setValue]);

	const handleFetchFiles = async () => {
		if (!watchedModelId) {
			setFetchMessage({
				text: "Please enter a model ID first",
				type: "error",
			});
			return;
		}

		setIsFetchingFiles(true);
		setFetchMessage(null);
		setFetchedParts(null);
		setDetectedArch(null);
		setRawPathMap(null);

		try {
			// 1. Fetch Model Config and Siblings in parallel
			const response = await fetch(
				`https://huggingface.co/api/models/${watchedModelId}`,
			);
			if (!response.ok) {
				throw new Error(`Failed to fetch model info: ${response.statusText}`);
			}

			const data = await response.json();
			const siblings = data.siblings as { rfilename: string }[];

			if (!siblings) {
				throw new Error("No files found for this model");
			}

			// 2. Detect Architecture and Modality
			let architecture = "Unknown";
			let modality: "text" | "multimodal" = "text";

			// Try to find config.json to detect arch
			const configSibling = siblings.find((s) => s.rfilename === "config.json");
			if (configSibling) {
				try {
					const cfgRes = await fetch(
						`https://huggingface.co/${watchedModelId}/resolve/main/config.json`,
					);
					if (cfgRes.ok) {
						const cfg = await cfgRes.json();
						architecture =
							cfg.architectures?.[0] || cfg.model_type || "Unknown";
						if (
							cfg.model_type?.includes("vision") ||
							cfg.model_type?.includes("vl") ||
							architecture.toLowerCase().includes("vision") ||
							architecture.toLowerCase().includes("vl") ||
							data.tags?.includes("multimodal") ||
							data.pipeline_tag === "image-text-to-text"
						) {
							modality = "multimodal";
						}
					}
				} catch (e) {
					console.warn("Failed to parse config.json", e);
				}
			}

			setDetectedArch(architecture);
			setValue("modality", modality);
			if (architecture.includes("Qwen")) setValue("modelClass", "Qwen3_5");
			else if (architecture.includes("Gemma")) setValue("modelClass", "Gemma4");
			else setValue("modelClass", "Other");

			// 3. Process ONNX files
			const onnxFiles = siblings
				.map((s) => s.rfilename)
				.filter((f) => f.endsWith(".onnx") && !f.includes("data"));

			if (onnxFiles.length === 0) {
				throw new Error("No .onnx files found in this repository");
			}

			const partsInfo: Record<string, Set<string>> = {};
			const localRawPathMap: Record<string, Record<string, string>> = {};

			for (const file of onnxFiles) {
				const fileName = file.split("/").pop() || file;
				const nameWithoutExt = fileName.replace(".onnx", "");

				const match = nameWithoutExt.match(
					/_(q4|q4f16|q8|int8|uint8|fp16|fp32|bnb4)$/,
				);

				let partName = nameWithoutExt;
				let quant = "fp32";

				if (match) {
					quant = match[1];
					partName = nameWithoutExt.slice(0, -match[0].length);
				}

				if (!localRawPathMap[partName]) {
					partsInfo[partName] = new Set();
					localRawPathMap[partName] = {};
				}
				partsInfo[partName].add(quant);
				localRawPathMap[partName][quant] = file;
			}

			const formattedParts: Record<string, string[]> = {};
			for (const [part, quants] of Object.entries(partsInfo)) {
				formattedParts[part] = Array.from(quants);
			}

			setFetchedParts(formattedParts);
			setRawPathMap(localRawPathMap);

			// Update newModelDtype to the best available for the main part
			const mainPartKey =
				formattedParts.decoder_model_merged ||
				formattedParts.decoder_model ||
				formattedParts.model
					? Object.keys(formattedParts).find(
							(k) =>
								k === "decoder_model_merged" ||
								k === "decoder_model" ||
								k === "model",
						)
					: Object.keys(formattedParts)[0];

			const mainPart = formattedParts[mainPartKey || ""];

			if (mainPart && mainPart.length > 0) {
				const filtered = mainPart.filter(
					(q) => isFp16Supported || (q !== "fp16" && q !== "q4f16"),
				);
				const toCheck = filtered.length > 0 ? filtered : mainPart;
				const best =
					toCheck.find((q) => q === "q4f16") ||
					toCheck.find((q) => q === "q4") ||
					toCheck.find((q) => q === "q8") ||
					toCheck[0];
				setValue("dtype", best as DtypeValue);
			}

			setFetchMessage({
				text: `Successfully scanned ${architecture} model.`,
				type: "success",
			});

			if (!watch("name") && data.modelId) {
				setValue("name", data.modelId.split("/").pop() || "");
			}
		} catch (err) {
			setFetchMessage({ text: (err as Error).message, type: "error" });
		} finally {
			setIsFetchingFiles(false);
		}
	};

	const selectedPathMap = useMemo(() => {
		if (!fetchedParts || !rawPathMap) return null;
		const resolved = resolveDtypeFallback(
			watchedDtype,
			fetchedParts,
			isFp16Supported,
		);
		const finalPaths: Record<string, string> = {};

		for (const [part, quant] of Object.entries(resolved)) {
			const path = rawPathMap[part]?.[quant as string];
			if (path) {
				// We store mapping as: Logical FileName -> Repo Path
				// e.g. "decoder_model_merged.onnx" -> "onnx/decoder_model_merged_q8.onnx"
				finalPaths[`${part}.onnx`] = path;
			}
		}
		return finalPaths;
	}, [watchedDtype, fetchedParts, rawPathMap, isFp16Supported]);

	const onAddModel = async (data: AddModelFormData) => {
		// Only allow save if scan completed
		if (!selectedPathMap) {
			setFetchMessage({ text: "Please scan the model first", type: "error" });
			return;
		}

		let resolvedDtype: ModelConfig["dtype"] = data.dtype;
		if (fetchedParts && Object.keys(fetchedParts).length > 1) {
			resolvedDtype = resolveDtypeFallback(
				data.dtype,
				fetchedParts,
				isFp16Supported,
			) as any;
		}

		const model: ModelConfig = {
			id: data.modelId,
			name: data.name || data.modelId.split("/").pop() || data.modelId,
			displayName: data.name || data.modelId.split("/").pop() || data.modelId,
			size: "Unknown",
			description: "Custom ONNX model",
			modelClass: data.modelClass,
			architecture: detectedArch || undefined,
			pathMap: selectedPathMap || undefined,
			repoFiles: repoFiles || undefined,
			dtype: resolvedDtype,
			sampling: {
				thinking: {
					temperature: 1.0,
					top_p: 0.95,
					top_k: 20,
					min_p: 0.0,
					presence_penalty: 1.5,
					repetition_penalty: 1.2,
					max_new_tokens: 32768,
				},
				nonThinking: {
					temperature: 1.0,
					top_p: 1.0,
					top_k: 20,
					min_p: 0.0,
					presence_penalty: 2.0,
					repetition_penalty: 1.2,
					max_new_tokens: 8192,
				},
			},
			thinking: {
				enabled: data.supportsThinking,
				tagFormat: data.supportsThinking ? data.thinkingFormat : null,
				customTags:
					data.supportsThinking && data.thinkingFormat === "custom"
						? {
								start: data.customStartTag,
								end: [data.customEndTag],
								suffix: data.customSuffix || undefined,
							}
						: undefined,
			},
			modality: data.modality,
			isDefault: 0,
		};

		try {
			await createModel.mutateAsync(model);
			setShowAddForm(false);
			reset();
		} catch (err) {
			alert(`Failed to add model: ${(err as Error).message}`);
		}
	};

	const handleSave = async () => {
		setSaving(true);
		await updateSetting.mutateAsync({
			key: "active_provider",
			value: selectedProvider,
		});
		await updateSetting.mutateAsync({ key: "api_key", value: key });
		await updateSetting.mutateAsync({ key: "model", value: selectedModel });
		setSaving(false);
		setSaved(true);
		setTimeout(() => setSaved(false), 2000);
	};

	const selectProvider = (id: string) => {
		setSelectedProvider(id);
		const p = PROVIDERS.find((p) => p.id === id);
		if (p) setSelectedModel(p.defaultModel);
		setShowProviderDropdown(false);
	};

	const handleLoadModel = async (modelId: string) => {
		if (activeModel?.id !== modelId) {
			await setActiveModel(modelId);
		}
		setLoadingModel(true);
		setLoadError(null);
		try {
			await load((p) => {
				if (p >= 100) setLoadingModel(false);
			});
		} catch (err) {
			setLoadError((err as Error).message);
		} finally {
			setLoadingModel(false);
		}
	};

	const handleUnloadModel = async () => {
		setUnloadingModel(true);
		try {
			await unload();
		} finally {
			setUnloadingModel(false);
		}
	};

	const handleDeleteModel = async (
		modelId: string,
		modelName: string,
		isDefault: boolean,
	) => {
		const message = isDefault
			? `Are you sure you want to delete ${modelName} from your local cache? This will free up disk space, but you will need to download it again to use it.`
			: `Are you sure you want to delete ${modelName}? This will remove it from your database and delete its local cache.`;

		if (!window.confirm(message)) {
			return;
		}

		setDeletingModelId(modelId);
		try {
			await deleteModel(modelId);
		} finally {
			setDeletingModelId(null);
		}
	};

	const handleToggleMode = async (mode: "cloud" | "local") => {
		await setInferenceMode(mode);
	};

	const handleToggleAddForm = () => {
		if (showAddForm) {
			reset();
			resetScanState();
		}
		setShowAddForm(!showAddForm);
	};

	const handleDeviceChange = async (d: "webgpu" | "wasm") => {
		await setDevice(d);
	};

	return (
		<div className="flex flex-1 items-start justify-center overflow-y-auto px-4 py-8">
			<div className="w-full max-w-md">
				<div className="mb-8 flex items-center gap-3">
					<button
						type="button"
						onClick={() => navigate("/")}
						className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
						aria-label="Go back to home"
					>
						<ArrowLeft className="h-4 w-4" />
					</button>
					<h1 className="text-2xl font-semibold text-zinc-100">Settings</h1>
				</div>

				<div className="space-y-6">
					{/* Inference Mode Toggle */}
					<fieldset className="space-y-3">
						<legend className="text-sm font-medium text-zinc-300">
							Inference Mode
						</legend>
						<div className="flex rounded-lg border border-zinc-700 bg-zinc-800/50 p-1">
							<button
								type="button"
								onClick={() => handleToggleMode("cloud")}
								className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-all ${
									!isLocal
										? "bg-zinc-100 text-zinc-900 shadow-sm"
										: "text-zinc-400 hover:text-zinc-200"
								}`}
								aria-pressed={!isLocal}
							>
								<WifiOff className="h-4 w-4" />
								Cloud
							</button>
							<button
								type="button"
								onClick={() => handleToggleMode("local")}
								className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-all ${
									isLocal
										? "bg-zinc-100 text-zinc-900 shadow-sm"
										: "text-zinc-400 hover:text-zinc-200"
								}`}
								aria-pressed={isLocal}
							>
								<Cpu className="h-4 w-4" />
								Local
							</button>
						</div>
					</fieldset>

					{/* Local LLM Section */}
					{isLocal && (
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<span className="text-sm font-medium text-zinc-300">
									Local Models
								</span>
								<fieldset className="flex rounded-lg border border-zinc-700 bg-zinc-800/50 p-0.5">
									<legend className="sr-only">Device selection</legend>
									<button
										type="button"
										onClick={() => handleDeviceChange("webgpu")}
										disabled={!hasWebGPU}
										className={`px-2 py-1 text-[10px] font-medium transition-all ${
											device === "webgpu"
												? "bg-zinc-100 text-zinc-900 shadow-sm rounded-md"
												: "text-zinc-400 hover:text-zinc-200"
										} disabled:opacity-30 disabled:cursor-not-allowed`}
										aria-pressed={device === "webgpu"}
									>
										WebGPU
									</button>
									<button
										type="button"
										onClick={() => handleDeviceChange("wasm")}
										className={`px-2 py-1 text-[10px] font-medium transition-all ${
											device === "wasm"
												? "bg-zinc-100 text-zinc-900 shadow-sm rounded-md"
												: "text-zinc-400 hover:text-zinc-200"
										}`}
										aria-pressed={device === "wasm"}
									>
										CPU
									</button>
								</fieldset>
							</div>

							{loadError && (
								<div
									className="flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2 text-xs text-red-300"
									role="alert"
								>
									<X className="h-3.5 w-3.5 shrink-0" />
									<span className="flex-1 truncate">{loadError}</span>
								</div>
							)}

							<div className="flex items-center justify-between">
								<h3 className="text-sm font-medium text-zinc-300">
									Model List
								</h3>
								<button
									type="button"
									onClick={handleToggleAddForm}
									className="text-xs font-medium text-blue-400 hover:text-blue-300"
								>
									{showAddForm ? "Cancel" : "Add Model"}
								</button>
							</div>

							{showAddForm && (
								<form
									onSubmit={handleSubmit(onAddModel)}
									className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
								>
									<div className="space-y-2">
										<label
											htmlFor="model-id"
											className="text-[10px] font-medium uppercase text-zinc-500"
										>
											Hugging Face Model ID
										</label>
										<div className="flex gap-2">
											<input
												id="model-id"
												type="text"
												required
												{...register("modelId")}
												placeholder="onnx-community/..."
												className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
											/>
											<button
												type="button"
												onClick={handleFetchFiles}
												disabled={isFetchingFiles || !watchedModelId}
												className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-50"
											>
												{isFetchingFiles ? (
													<Loader2 className="h-4 w-4 animate-spin" />
												) : (
													<Download className="h-4 w-4" />
												)}
												Fetch Files
											</button>
										</div>
										{fetchMessage && (
											<p
												className={`text-[10px] ${
													fetchMessage.type === "success"
														? "text-emerald-400"
														: "text-red-400"
												}`}
											>
												{fetchMessage.text}
											</p>
										)}

										{selectedPathMap && (
											<div className="mt-2 space-y-1 rounded-lg bg-zinc-950/50 p-2">
												<div className="flex items-center justify-between mb-1 border-b border-zinc-800 pb-1">
													<p className="text-[9px] font-bold uppercase text-zinc-500">
														Files Selected Preview
													</p>
													{detectedArch && (
														<span className="text-[8px] text-blue-400 font-medium">
															{detectedArch}
														</span>
													)}
												</div>
												{Object.entries(selectedPathMap).map(
													([logical, repo]) => (
														<div
															key={logical}
															className="flex items-center justify-between text-[10px]"
														>
															<span className="text-zinc-400">{logical}</span>
															<span className="truncate text-zinc-600 pl-4">
																{repo}
															</span>
														</div>
													),
												)}
											</div>
										)}
									</div>
									<div className="space-y-2">
										<label
											htmlFor="model-name"
											className="text-[10px] font-medium uppercase text-zinc-500"
										>
											Display Name (optional)
										</label>
										<input
											id="model-name"
											type="text"
											{...register("name")}
											placeholder="My Model"
											className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
										/>
									</div>
									<div className="grid grid-cols-2 gap-4">
										<div className="space-y-2">
											<label
												htmlFor="model-dtype"
												className="text-[10px] font-medium uppercase text-zinc-500"
											>
												Dtype
											</label>
											<Controller
												name="dtype"
												control={control}
												render={({ field }) => (
													<select
														id="model-dtype"
														{...field}
														className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
													>
														{fetchedParts ? (
															<>
																{/* Show options from the identified decoder part */}
																{(
																	fetchedParts.decoder_model_merged ||
																	fetchedParts.decoder_model ||
																	fetchedParts.model ||
																	Object.values(fetchedParts).sort(
																		(a, b) => b.length - a.length,
																	)[0] ||
																	[]
																)
																	.filter(
																		(q) =>
																			isFp16Supported ||
																			(q !== "fp16" && q !== "q4f16"),
																	)
																	.map((q) => (
																		<option key={q} value={q}>
																			{q}
																		</option>
																	))}
																<option value="auto">auto</option>
															</>
														) : (
															<>
																{isFp16Supported && (
																	<option value="q4f16">
																		q4f16 (Recommended)
																	</option>
																)}
																{isFp16Supported && (
																	<option value="fp16">fp16</option>
																)}
																<option value="q8">q8</option>
																<option value="q4">q4</option>
																<option value="auto">auto</option>
															</>
														)}
													</select>
												)}
											/>
										</div>
										<div className="space-y-2">
											<label
												htmlFor="model-class"
												className="text-[10px] font-medium uppercase text-zinc-500"
											>
												Model Class
											</label>
											<select
												id="model-class"
												{...register("modelClass")}
												className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
											>
												<option value="Qwen3_5">Qwen 3.5</option>
												<option value="Gemma4">Gemma 4</option>
												<option value="Other">Other</option>
											</select>
										</div>
									</div>
									<div className="space-y-2">
										<label
											htmlFor="model-modality"
											className="text-[10px] font-medium uppercase text-zinc-500"
										>
											Modality
										</label>
										<select
											id="model-modality"
											{...register("modality")}
											className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
										>
											<option value="text">Text Only</option>
											<option value="multimodal">Vision + Text</option>
										</select>
									</div>
									<div className="space-y-3">
										<div className="flex items-center gap-2">
											<input
												id="supports-thinking"
												type="checkbox"
												{...register("supportsThinking")}
												className="h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-blue-500 focus:ring-0"
											/>
											<label
												htmlFor="supports-thinking"
												className="text-sm text-zinc-300"
											>
												Supports Thinking
											</label>
										</div>

										{watchedSupportsThinking && (
											<div className="space-y-2 pl-6">
												<label
													htmlFor="thinking-format"
													className="text-[10px] font-medium uppercase text-zinc-500"
												>
													Tag Format
												</label>
												<select
													id="thinking-format"
													{...register("thinkingFormat")}
													className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
												>
													<option value="qwen">Qwen (&lt;think&gt;)</option>
													<option value="gemma">
														Gemma (&lt;|channel&gt;thought)
													</option>
													<option value="custom">Custom Tags</option>
												</select>
											</div>
										)}

										{watchedSupportsThinking &&
											watchedThinkingFormat === "custom" && (
												<div className="space-y-3 pl-6">
													<div className="space-y-1.5">
														<label
															htmlFor="custom-start"
															className="text-[10px] font-medium uppercase text-zinc-500"
														>
															Start Tag
														</label>
														<input
															id="custom-start"
															type="text"
															{...register("customStartTag")}
															placeholder="e.g. <think>"
															className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
														/>
													</div>
													<div className="space-y-1.5">
														<label
															htmlFor="custom-end"
															className="text-[10px] font-medium uppercase text-zinc-500"
														>
															End Tag
														</label>
														<input
															id="custom-end"
															type="text"
															{...register("customEndTag")}
															placeholder="e.g. </think>"
															className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
														/>
													</div>
													<div className="space-y-1.5">
														<label
															htmlFor="custom-suffix"
															className="text-[10px] font-medium uppercase text-zinc-500"
														>
															End of Text Tag (optional)
														</label>
														<input
															id="custom-suffix"
															type="text"
															{...register("customSuffix")}
															placeholder="e.g. <|endoftext|>"
															className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
														/>
													</div>
												</div>
											)}
									</div>
									<button
										type="submit"
										disabled={createModel.isPending || !selectedPathMap}
										className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
									>
										{createModel.isPending ? "Adding..." : "Add Model Entry"}
									</button>
								</form>
							)}

							<ul className="grid gap-3">
								{availableModels.map((m) => {
									const isSelected = activeModel?.id === m.id;
									const isEngineActive = info.modelId === m.id;
									const isCached = cachedModelIds.has(m.id);
									const currentStatus = isEngineActive ? info.status : "idle";
									const statusLabel = STATUS_LABELS[currentStatus];

									return (
										<li
											key={m.id}
											className={`relative overflow-hidden rounded-xl border p-4 transition-all ${
												isSelected
													? "border-zinc-600 bg-zinc-800/80 ring-1 ring-zinc-600"
													: "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
											}`}
										>
											<div className="flex items-start justify-between">
												<div className="space-y-1">
													<div className="flex items-center gap-2">
														<h3 className="text-sm font-semibold text-zinc-100">
															{m.displayName}
														</h3>
														{isCached && (
															<span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
																cached
															</span>
														)}
														{isEngineActive &&
															currentStatus !== "idle" &&
															currentStatus !== "downloaded" && (
																<span
																	className={`text-[10px] font-medium ${statusLabel.color}`}
																>
																	{statusLabel.text}
																</span>
															)}
													</div>
													<p className="text-xs text-zinc-500">
														{m.description}
													</p>
													<p className="text-[10px] text-zinc-600">
														Size: {m.size} •{" "}
														{m.modality === "multimodal" ? "Vision" : "Text"} •{" "}
														{typeof m.dtype === "string"
															? m.dtype
															: m.dtype.decoder_model_merged}
													</p>
												</div>
											</div>

											{/* Progress bars for active model */}
											{isEngineActive && currentStatus === "downloading" && (
												<div className="mt-3 space-y-2">
													<div className="space-y-1">
														<div className="flex justify-between text-[10px] text-zinc-400">
															<span>Overall Progress</span>
															<span>{info.progress}%</span>
														</div>
														<div
															className="h-1 overflow-hidden rounded-full bg-zinc-800"
															role="progressbar"
															aria-valuenow={info.progress}
															aria-valuemin={0}
															aria-valuemax={100}
														>
															<div
																className="h-full bg-blue-500 transition-all duration-300"
																style={{ width: `${info.progress}%` }}
															/>
														</div>
													</div>

													{info.downloads &&
														Object.entries(info.downloads).length > 0 && (
															<div className="space-y-1.5 pt-1 border-t border-zinc-800">
																{Object.entries(info.downloads).map(
																	([file, progress]) => (
																		<div key={file} className="space-y-0.5">
																			<div className="flex justify-between text-[8px] text-zinc-500">
																				<span className="truncate max-w-[70%]">
																					{file}
																				</span>
																				<span>{progress}%</span>
																			</div>
																			<div className="h-0.5 overflow-hidden rounded-full bg-zinc-800/50">
																				<div
																					className="h-full bg-zinc-500 transition-all duration-300"
																					style={{ width: `${progress}%` }}
																				/>
																			</div>
																		</div>
																	),
																)}
															</div>
														)}
												</div>
											)}

											{isEngineActive && currentStatus === "loading" && (
												<div className="mt-3 space-y-2">
													<div className="flex items-center gap-2 text-[10px] text-zinc-400">
														<Loader2 className="h-3 w-3 animate-spin" />
														<span>Loading into memory...</span>
													</div>
													{info.downloads &&
														Object.entries(info.downloads).length > 0 && (
															<div className="space-y-1.5 pt-1 border-t border-zinc-800">
																{Object.entries(info.downloads).map(
																	([file, progress]) => (
																		<div key={file} className="space-y-0.5">
																			<div className="flex justify-between text-[8px] text-zinc-500">
																				<span className="truncate max-w-[70%]">
																					{file}
																				</span>
																				<span>{progress}%</span>
																			</div>
																			<div className="h-0.5 overflow-hidden rounded-full bg-zinc-800/50">
																				<div
																					className="h-full bg-blue-400 transition-all duration-300"
																					style={{ width: `${progress}%` }}
																				/>
																			</div>
																		</div>
																	),
																)}
															</div>
														)}
												</div>
											)}

											<div className="mt-4 flex gap-2">
												{isEngineActive && currentStatus === "ready" ? (
													<button
														type="button"
														onClick={handleUnloadModel}
														disabled={unloadingModel}
														className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/50 py-1.5 text-xs font-medium text-zinc-300 transition-all hover:bg-zinc-700"
														aria-label={`Unload ${m.displayName}`}
													>
														{unloadingModel ? (
															<Loader2 className="h-3.5 w-3.5 animate-spin" />
														) : (
															"Unload"
														)}
													</button>
												) : (
													<button
														type="button"
														onClick={() => handleLoadModel(m.id)}
														disabled={
															loadingModel ||
															(isEngineActive &&
																currentStatus === "downloading")
														}
														className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-zinc-100 py-1.5 text-xs font-medium text-zinc-900 transition-all hover:bg-white disabled:opacity-50 disabled:pointer-none:"
														aria-label={`Load ${m.displayName}`}
													>
														{isEngineActive && loadingModel ? (
															<Loader2 className="h-3.5 w-3.5 animate-spin" />
														) : (
															"Load"
														)}
													</button>
												)}

												{(isCached || !m.isDefault) && (
													<button
														type="button"
														onClick={() =>
															handleDeleteModel(
																m.id,
																m.displayName,
																!!m.isDefault,
															)
														}
														disabled={
															!!deletingModelId ||
															(isEngineActive && currentStatus === "ready") ||
															loadingModel
														}
														className="flex items-center justify-center rounded-lg border border-red-800/50 bg-red-950/20 px-3 py-1.5 text-xs font-medium text-red-400 transition-all hover:bg-red-950/40 disabled:opacity-30"
														aria-label={
															m.isDefault
																? `Delete ${m.displayName} from cache`
																: `Delete ${m.displayName} entry`
														}
													>
														{deletingModelId === m.id ? (
															<Loader2 className="h-3.5 w-3.5 animate-spin" />
														) : (
															<Trash2 className="h-3.5 w-3.5" />
														)}
													</button>
												)}
											</div>
										</li>
									);
								})}
							</ul>
						</div>
					)}

					{/* Cloud Settings */}
					{!isLocal && (
						<>
							<div>
								<span
									id="provider-label"
									className="mb-2 block text-sm font-medium text-zinc-300"
								>
									Provider
								</span>
								<div className="relative">
									<button
										type="button"
										onClick={() => {
											setShowProviderDropdown(!showProviderDropdown);
										}}
										className="flex w-full items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-sm text-zinc-100 transition-colors hover:border-zinc-600"
										aria-expanded={showProviderDropdown}
										aria-haspopup="listbox"
										aria-labelledby="provider-label"
									>
										{PROVIDERS.find((p) => p.id === selectedProvider)?.name}
										<ChevronDown className="h-4 w-4 text-zinc-500" />
									</button>
									{showProviderDropdown && (
										<div
											className="absolute z-10 mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 py-1 shadow-xl"
											role="listbox"
										>
											{PROVIDERS.map((p) => (
												<button
													key={p.id}
													type="button"
													onClick={() => selectProvider(p.id)}
													className="flex w-full items-center justify-between px-4 py-2.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-100"
													role="option"
													aria-selected={selectedProvider === p.id}
												>
													{p.name}
													{selectedProvider === p.id && (
														<Check className="h-3.5 w-3.5" />
													)}
												</button>
											))}
										</div>
									)}
								</div>
							</div>

							<div>
								<span
									id="api-key-label"
									className="mb-2 block text-sm font-medium text-zinc-300"
								>
									API Key
								</span>
								<div className="relative">
									<input
										type={showKey ? "text" : "password"}
										value={key}
										onChange={(e) => setKey(e.target.value)}
										placeholder="sk-..."
										className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3 pr-10 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-zinc-600 focus:bg-zinc-800"
										aria-labelledby="api-key-label"
									/>
									<button
										type="button"
										onClick={() => setShowKey(!showKey)}
										className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
										aria-label={showKey ? "Hide API key" : "Show API key"}
									>
										{showKey ? (
											<EyeOff className="h-4 w-4" />
										) : (
											<Eye className="h-4 w-4" />
										)}
									</button>
								</div>
							</div>

							<div>
								<span
									id="model-label"
									className="mb-2 block text-sm font-medium text-zinc-300"
								>
									Model ID
								</span>
								<input
									type="text"
									value={selectedModel}
									onChange={(e) => setSelectedModel(e.target.value)}
									placeholder="e.g. gpt-4o, claude-3-sonnet..."
									className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-zinc-600 focus:bg-zinc-800"
									aria-labelledby="model-label"
								/>
							</div>

							<button
								type="button"
								onClick={handleSave}
								disabled={saving || !key.trim()}
								className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-100 px-4 py-3 text-sm font-medium text-zinc-900 transition-all hover:bg-white disabled:opacity-50"
							>
								{saved ? (
									<>
										<Check className="h-4 w-4" />
										Saved
									</>
								) : (
									"Save Settings"
								)}
							</button>
						</>
					)}
				</div>
			</div>
		</div>
	);
}
