import {
	ArrowLeft,
	Check,
	ChevronDown,
	Cpu,
	Eye,
	EyeOff,
	Loader2,
	Trash2,
	WifiOff,
	X,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateModel, useLocalLLM } from "#/hooks/use-local-llm";
import { useActiveProvider, useUpdateSetting } from "#/hooks/use-settings";
import type { DtypeValue, ModelClass, ModelConfig } from "#/lib/model-registry";

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

	// New model form state
	const [showAddForm, setShowAddForm] = useState(false);
	const [newModelId, setNewModelId] = useState("");
	const [newModelName, setNewModelName] = useState("");
	const [newModelDtype, setNewModelDtype] = useState<DtypeValue>("q4f16");
	const [newModelClass, setNewModelClass] = useState<ModelClass>("Qwen3_5");
	const [newModelModality, setNewModelModality] = useState<
		"text" | "multimodal"
	>("text");
	const [newModelSupportsThinking, setNewModelSupportsThinking] =
		useState(false);
	const [newModelThinkingFormat, setNewModelThinkingFormat] = useState<
		"qwen" | "gemma" | "custom"
	>("qwen");
	const [customStartTag, setCustomStartTag] = useState("<think>");
	const [customEndTag, setCustomEndTag] = useState("</think>");
	const [customSuffix, setCustomSuffix] = useState("");
	const createModel = useCreateModel();

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

	const handleAddModel = async (e: React.FormEvent) => {
		e.preventDefault();

		const model: ModelConfig = {
			id: newModelId,
			name: newModelName || newModelId.split("/").pop() || newModelId,
			displayName: newModelName || newModelId.split("/").pop() || newModelId,
			size: "Unknown",
			description: "Custom ONNX model",
			modelClass: newModelClass,
			dtype: newModelDtype,
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
				enabled: newModelSupportsThinking,
				tagFormat: newModelSupportsThinking ? newModelThinkingFormat : null,
				customTags:
					newModelSupportsThinking && newModelThinkingFormat === "custom"
						? {
								start: customStartTag,
								end: [customEndTag],
								suffix: customSuffix || undefined,
							}
						: undefined,
			},
			modality: newModelModality,
			isDefault: 0,
		};

		try {
			await createModel.mutateAsync(model);
			setShowAddForm(false);
			setNewModelId("");
			setNewModelName("");
		} catch (err) {
			alert(`Failed to add model: ${(err as Error).message}`);
		}
	};

	const handleToggleMode = async (mode: "cloud" | "local") => {
		await setInferenceMode(mode);
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
									onClick={() => setShowAddForm(!showAddForm)}
									className="text-xs font-medium text-blue-400 hover:text-blue-300"
								>
									{showAddForm ? "Cancel" : "Add Model"}
								</button>
							</div>

							{showAddForm && (
								<form
									onSubmit={handleAddModel}
									className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
								>
									<div className="space-y-2">
										<label
											htmlFor="model-id"
											className="text-[10px] font-medium uppercase text-zinc-500"
										>
											Hugging Face Model ID
										</label>
										<input
											id="model-id"
											type="text"
											required
											value={newModelId}
											onChange={(e) => setNewModelId(e.target.value)}
											placeholder="onnx-community/..."
											className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
										/>
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
											value={newModelName}
											onChange={(e) => setNewModelName(e.target.value)}
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
											<select
												id="model-dtype"
												value={newModelDtype as string}
												onChange={(e) =>
													setNewModelDtype(e.target.value as DtypeValue)
												}
												className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
											>
												<option value="q4f16">q4f16 (Recommended)</option>
												<option value="fp16">fp16</option>
												<option value="q8">q8</option>
												<option value="auto">auto</option>
											</select>
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
												value={newModelClass}
												onChange={(e) =>
													setNewModelClass(e.target.value as ModelClass)
												}
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
											value={newModelModality}
											onChange={(e) =>
												setNewModelModality(
													e.target.value as "text" | "multimodal",
												)
											}
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
												checked={newModelSupportsThinking}
												onChange={(e) =>
													setNewModelSupportsThinking(e.target.checked)
												}
												className="h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-blue-500 focus:ring-0"
											/>
											<label
												htmlFor="supports-thinking"
												className="text-sm text-zinc-300"
											>
												Supports Thinking
											</label>
										</div>

										{newModelSupportsThinking && (
											<div className="space-y-2 pl-6">
												<label
													htmlFor="thinking-format"
													className="text-[10px] font-medium uppercase text-zinc-500"
												>
													Tag Format
												</label>
												<select
													id="thinking-format"
													value={newModelThinkingFormat}
													onChange={(e) =>
														setNewModelThinkingFormat(
															e.target.value as "qwen" | "gemma" | "custom",
														)
													}
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

										{newModelSupportsThinking &&
											newModelThinkingFormat === "custom" && (
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
															value={customStartTag}
															onChange={(e) =>
																setCustomStartTag(e.target.value)
															}
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
															value={customEndTag}
															onChange={(e) => setCustomEndTag(e.target.value)}
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
															value={customSuffix}
															onChange={(e) => setCustomSuffix(e.target.value)}
															placeholder="e.g. <|endoftext|>"
															className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
														/>
													</div>
												</div>
											)}
									</div>
									<button
										type="submit"
										disabled={createModel.isPending}
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
												<div className="mt-3 space-y-1.5">
													<div className="flex justify-between text-[10px] text-zinc-400">
														<span>Downloading...</span>
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
											)}

											{isEngineActive && currentStatus === "loading" && (
												<div className="mt-3 flex items-center gap-2 text-[10px] text-zinc-400">
													<Loader2 className="h-3 w-3 animate-spin" />
													Downloading missing files and loading into memory...
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
