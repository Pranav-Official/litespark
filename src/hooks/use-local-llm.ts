import { useCallback, useEffect, useState } from "react";
import { localLLM, type ModelInfo, type ModelStatus } from "#/lib/local-llm";
import {
	DEFAULT_MODEL_ID,
	getAvailableModels,
	getModelConfig,
} from "#/lib/model-registry";
import { useAllSettings, useUpdateSetting } from "./use-settings";

const VALID_STATUSES: ModelStatus[] = [
	"idle",
	"downloading",
	"downloaded",
	"loading",
	"ready",
	"error",
];

export function useLocalLLM() {
	const { data: settingsMap } = useAllSettings();
	const updateSetting = useUpdateSetting();
	const savedModelId = settingsMap?.local_model_id ?? DEFAULT_MODEL_ID;
	const [info, setInfo] = useState<ModelInfo>(localLLM.getInfo());
	const [cachedModelIds, setCachedModelIds] = useState<Set<string>>(new Set());

	const checkAllCaches = useCallback(async () => {
		const available = getAvailableModels();
		const cached = new Set<string>();
		for (const m of available) {
			if (await localLLM.isCached(m.id)) {
				cached.add(m.id);
			}
		}
		setCachedModelIds(cached);
	}, []);

	useEffect(() => {
		const unsub = localLLM.onStatusChange(setInfo);
		return () => {
			unsub();
		};
	}, []);

	useEffect(() => {
		checkAllCaches();
	}, [checkAllCaches]);

	useEffect(() => {
		localLLM.setModel(savedModelId);
	}, [savedModelId]);

	const download = useCallback(
		async (onProgress?: (p: number) => void) => {
			await localLLM.download(onProgress);
			await updateSetting.mutateAsync({
				key: "local_model_status",
				value: "downloaded",
			});
		},
		[updateSetting],
	);

	const load = useCallback(
		async (onProgress?: (p: number) => void) => {
			await localLLM.load(onProgress);
			await updateSetting.mutateAsync({
				key: "local_model_status",
				value: "loaded",
			});
		},
		[updateSetting],
	);

	const unload = useCallback(async () => {
		localLLM.unload();
		await updateSetting.mutateAsync({
			key: "local_model_status",
			value: "downloaded",
		});
	}, [updateSetting]);

	const deleteModel = useCallback(
		async (modelId?: string) => {
			const targetId = modelId ?? savedModelId;
			if (targetId === savedModelId) {
				await localLLM.delete();
				await updateSetting.mutateAsync({
					key: "local_model_status",
					value: "idle",
				});
			} else {
				// Clear cache for specific model without affecting active model if different
				const cacheKeys = await caches.keys();
				for (const key of cacheKeys) {
					if (key.includes("transformers") || key.includes("huggingface")) {
						const cache = await caches.open(key);
						const requests = await cache.keys();
						for (const req of requests) {
							if (req.url.includes(targetId)) {
								await cache.delete(req);
							}
						}
					}
				}
			}
			await checkAllCaches();
		},
		[updateSetting, savedModelId, checkAllCaches],
	);

	const inferenceMode = settingsMap?.inference_mode ?? "cloud";
	const setInferenceMode = useCallback(
		async (mode: "cloud" | "local") => {
			await updateSetting.mutateAsync({
				key: "inference_mode",
				value: mode,
			});
		},
		[updateSetting],
	);

	const device = settingsMap?.local_device ?? "webgpu";
	const setDevice = useCallback(
		async (d: "webgpu" | "wasm") => {
			localLLM.setDevice(d);
			await updateSetting.mutateAsync({
				key: "local_device",
				value: d,
			});
		},
		[updateSetting],
	);

	const setActiveModel = useCallback(
		async (modelId: string) => {
			localLLM.setModel(modelId);
			await updateSetting.mutateAsync({
				key: "local_model_id",
				value: modelId,
			});
		},
		[updateSetting],
	);

	const savedStatus = settingsMap?.local_model_status;

	let effectiveStatus: ModelStatus = info.status;

	if (info.status === "idle" && savedStatus) {
		if (savedStatus === "ready" || savedStatus === "loading") {
			effectiveStatus = "downloaded";
		} else if (VALID_STATUSES.includes(savedStatus as ModelStatus)) {
			effectiveStatus = savedStatus as ModelStatus;
		} else {
			effectiveStatus = "idle";
		}
	}

	const displayInfo: ModelInfo = {
		...info,
		status: effectiveStatus,
	};

	const activeModel = getModelConfig(savedModelId);
	const availableModels = getAvailableModels();

	return {
		info: displayInfo,
		download,
		load,
		unload,
		deleteModel,
		inferenceMode,
		setInferenceMode,
		isLocal: inferenceMode === "local",
		device,
		setDevice,
		hasWebGPU: typeof navigator !== "undefined" && "gpu" in navigator,
		activeModel,
		setActiveModel,
		availableModels,
		cachedModelIds,
		checkAllCaches,
	};
}
