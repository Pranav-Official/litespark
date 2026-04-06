import { ArrowLeft, Check, ChevronDown, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAvailableModels } from "#/hooks/use-chat-session";
import { useActiveProvider, useUpdateSetting } from "#/hooks/use-settings";

const PROVIDERS = [
	{ id: "openai", name: "OpenAI", defaultModel: "gpt-4o" },
	{ id: "gemini", name: "Gemini", defaultModel: "gemini-2.5-flash" },
	{ id: "openrouter", name: "OpenRouter", defaultModel: "openai/gpt-4o" },
];

export default function SettingsPage() {
	const navigate = useNavigate();
	const { provider, apiKey, model } = useActiveProvider();
	const updateSetting = useUpdateSetting();

	const [selectedProvider, setSelectedProvider] = useState(provider);
	const [key, setKey] = useState(apiKey);
	const [selectedModel, setSelectedModel] = useState(model);
	const [showKey, setShowKey] = useState(false);
	const [showProviderDropdown, setShowProviderDropdown] = useState(false);
	const [showModelDropdown, setShowModelDropdown] = useState(false);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);

	const models = getAvailableModels(selectedProvider);

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

	const selectModel = (m: string) => {
		setSelectedModel(m);
		setShowModelDropdown(false);
	};

	return (
		<div className="flex flex-1 items-center justify-center px-4">
			<div className="w-full max-w-md">
				<div className="mb-8 flex items-center gap-3">
					<button
						type="button"
						onClick={() => navigate(-1)}
						className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
					>
						<ArrowLeft className="h-4 w-4" />
					</button>
					<h1 className="text-2xl font-semibold text-zinc-100">Settings</h1>
				</div>

				<div className="space-y-6">
					<div>
						<span className="mb-2 block text-sm font-medium text-zinc-300">
							Provider
						</span>
						<div className="relative">
							<button
								type="button"
								onClick={() => {
									setShowProviderDropdown(!showProviderDropdown);
									setShowModelDropdown(false);
								}}
								className="flex w-full items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-sm text-zinc-100 transition-colors hover:border-zinc-600"
							>
								{PROVIDERS.find((p) => p.id === selectedProvider)?.name}
								<ChevronDown className="h-4 w-4 text-zinc-500" />
							</button>
							{showProviderDropdown && (
								<div className="absolute z-10 mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 py-1 shadow-xl">
									{PROVIDERS.map((p) => (
										<button
											key={p.id}
											type="button"
											onClick={() => selectProvider(p.id)}
											className="flex w-full items-center justify-between px-4 py-2.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-100"
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
						<span className="mb-2 block text-sm font-medium text-zinc-300">
							API Key
						</span>
						<div className="relative">
							<input
								type={showKey ? "text" : "password"}
								value={key}
								onChange={(e) => setKey(e.target.value)}
								placeholder="sk-..."
								className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3 pr-10 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-zinc-600 focus:bg-zinc-800"
							/>
							<button
								type="button"
								onClick={() => setShowKey(!showKey)}
								className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
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
						<span className="mb-2 block text-sm font-medium text-zinc-300">
							Model
						</span>
						<div className="relative">
							<button
								type="button"
								onClick={() => {
									setShowModelDropdown(!showModelDropdown);
									setShowProviderDropdown(false);
								}}
								className="flex w-full items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-sm text-zinc-100 transition-colors hover:border-zinc-600"
							>
								<span className="truncate">{selectedModel}</span>
								<ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />
							</button>
							{showModelDropdown && (
								<div className="absolute z-10 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-800 py-1 shadow-xl">
									{models.map((m) => (
										<button
											key={m}
											type="button"
											onClick={() => selectModel(m)}
											className="flex w-full items-center justify-between px-4 py-2.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-100"
										>
											<span className="truncate">{m}</span>
											{selectedModel === m && (
												<Check className="h-3.5 w-3.5 shrink-0" />
											)}
										</button>
									))}
								</div>
							)}
						</div>
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
				</div>
			</div>
		</div>
	);
}
