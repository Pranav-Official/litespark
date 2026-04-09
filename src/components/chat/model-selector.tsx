import { Check, ChevronDown, Cloud, Cpu, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocalLLM } from "#/hooks/use-local-llm";
import { useActiveProvider, useUpdateSetting } from "#/hooks/use-settings";

const CLOUD_PROVIDERS = [
	{ id: "openai", name: "OpenAI" },
	{ id: "gemini", name: "Gemini" },
	{ id: "openrouter", name: "OpenRouter" },
];

export default function ModelSelector() {
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	const { provider } = useActiveProvider();
	const updateSetting = useUpdateSetting();
	const {
		isLocal,
		availableModels,
		activeModel,
		info,
		setInferenceMode,
		setActiveModel,
		load,
		cachedModelIds,
	} = useLocalLLM();

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(e.target as Node)
			) {
				setIsOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const currentLabel = isLocal
		? activeModel?.displayName || "Local Model"
		: CLOUD_PROVIDERS.find((p) => p.id === provider)?.name || "Cloud";

	const handleSelectCloud = async (providerId: string) => {
		await updateSetting.mutateAsync({
			key: "active_provider",
			value: providerId,
		});
		await setInferenceMode("cloud");
		setIsOpen(false);
	};

	const handleLoadLocal = async (modelId: string) => {
		await setInferenceMode("local");
		if (activeModel?.id !== modelId) {
			await setActiveModel(modelId);
		}
		try {
			await load();
			setIsOpen(false);
		} catch (error) {
			console.error("Failed to load model:", error);
		}
	};

	const cachedModels = availableModels.filter((m) => cachedModelIds.has(m.id));

	return (
		<div className="relative" ref={dropdownRef}>
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				className="flex items-center gap-2 rounded-lg bg-zinc-800/50 px-3 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
				aria-expanded={isOpen}
				aria-haspopup="menu"
			>
				{isLocal ? (
					<Cpu className="h-4 w-4 text-emerald-400" />
				) : (
					<Cloud className="h-4 w-4 text-blue-400" />
				)}
				<span className="max-w-[120px] truncate sm:max-w-[200px]">
					{currentLabel}
				</span>
				<ChevronDown
					className={`h-4 w-4 text-zinc-400 transition-transform ${
						isOpen ? "rotate-180" : ""
					}`}
				/>
			</button>

			{isOpen && (
				<div className="absolute left-0 top-full z-50 mt-2 w-72 md:w-80 rounded-xl border border-zinc-700 bg-zinc-900 py-2 shadow-xl">
					{/* Cloud Providers */}
					<div className="px-3 pb-2 pt-1 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
						Cloud Providers
					</div>
					{CLOUD_PROVIDERS.map((p) => {
						const isSelected = !isLocal && provider === p.id;
						return (
							<button
								key={p.id}
								type="button"
								onClick={() => handleSelectCloud(p.id)}
								className="flex w-full items-center justify-between px-4 py-2.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
								role="menuitem"
							>
								{p.name}
								{isSelected && <Check className="h-4 w-4 text-blue-400" />}
							</button>
						);
					})}

					<div className="my-2 border-t border-zinc-800" />

					{/* Local Models */}
					<div className="px-3 pb-2 pt-1 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
						Cached Local Models
					</div>
					<div className="max-h-60 overflow-y-auto">
						{cachedModels.length === 0 ? (
							<div className="px-4 py-3 text-sm text-zinc-500">
								No local models cached. Go to settings to download models.
							</div>
						) : (
							cachedModels.map((m) => {
								const isEngineActive = info.modelId === m.id;
								const isReady = isEngineActive && info.status === "ready";
								const isLoading =
									isEngineActive &&
									(info.status === "loading" || info.status === "downloading");
								const isSelected = isLocal && activeModel?.id === m.id;

								return (
									<div
										key={m.id}
										className="flex items-center justify-between gap-2 px-4 py-2 hover:bg-zinc-800 group"
									>
										<div className="flex flex-col truncate pr-2">
											<span
												className={`truncate text-sm ${
													isSelected ? "text-emerald-400" : "text-zinc-300"
												}`}
											>
												{m.displayName}
											</span>
											<span className="text-[10px] text-zinc-500">
												{m.size} •{" "}
												{typeof m.dtype === "string" ? m.dtype : "Q4"}
											</span>
										</div>
										<button
											type="button"
											onClick={() => handleLoadLocal(m.id)}
											disabled={isLoading || isReady}
											className={`flex shrink-0 items-center justify-center rounded px-3 py-1.5 text-xs font-medium transition-colors ${
												isReady
													? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
													: "bg-zinc-100 text-zinc-900 hover:bg-white"
											} disabled:opacity-50`}
										>
											{isLoading ? (
												<Loader2 className="h-3.5 w-3.5 animate-spin" />
											) : isReady ? (
												"Ready"
											) : (
												"Load"
											)}
										</button>
									</div>
								);
							})
						)}
					</div>
				</div>
			)}
		</div>
	);
}
