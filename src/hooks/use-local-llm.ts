import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { eq } from "drizzle-orm";
import { useCallback, useEffect, useState } from "react";
import { db } from "#/db";
import { localModels } from "#/db/schema";
import { localLLM, type ModelInfo, type ModelStatus } from "#/lib/local-llm";
import {
	DEFAULT_MODEL_ID,
	type ModelConfig,
	parseModelConfig,
} from "#/lib/model-registry";
import { useAllSettings, useUpdateSetting } from "./use-settings";

export function useLocalModels() {
	return useQuery({
		queryKey: ["local_models"],
		queryFn: async () => {
			const rows = await db.select().from(localModels);
			return rows.map(parseModelConfig);
		},
	});
}

export function useCreateModel() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (model: ModelConfig) => {
			await db.insert(localModels).values({
				id: model.id,
				name: model.name,
				displayName: model.displayName,
				size: model.size,
				description: model.description,
				modelClass: model.modelClass,
				dtype: JSON.stringify(model.dtype),
				pathMap: model.pathMap ? JSON.stringify(model.pathMap) : null,
				repoFiles: model.repoFiles ? JSON.stringify(model.repoFiles) : null,
				architecture: model.architecture ?? null,
				sampling: JSON.stringify(model.sampling),
				thinking: JSON.stringify(model.thinking),
				modality: model.modality,
				isDefault: model.isDefault ?? 0,
			});
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["local_models"] });
		},
	});
}

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
	const queryClient = useQueryClient();
	const { data: availableModels = [] } = useLocalModels();
	const savedModelId = settingsMap?.local_model_id ?? DEFAULT_MODEL_ID;

	const activeModel =
		availableModels.find((m) => m.id === savedModelId) ??
		availableModels.find((m) => m.id === DEFAULT_MODEL_ID) ??
		availableModels[0];

	const [info, setInfo] = useState<ModelInfo>(localLLM.getInfo());
	const [cachedModelIds, setCachedModelIds] = useState<Set<string>>(new Set());

	const checkAllCaches = useCallback(async () => {
		const ids = await localLLM.getCachedModelIds(
			availableModels.map((m) => m.id),
		);
		setCachedModelIds(ids);
	}, [availableModels]);

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
		if (activeModel) {
			localLLM.setModel(activeModel);
		}
	}, [activeModel]);

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
				value: "ready",
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
			const m = availableModels.find((m) => m.id === targetId);

			// 1. Clear cache
			localStorage.removeItem(`path_map_${targetId}`);
			localStorage.removeItem(`repo_files_${targetId}`);
			if (targetId === savedModelId) {
				await localLLM.delete();
				await updateSetting.mutateAsync({
					key: "local_model_status",
					value: "idle",
				});
			} else {
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

			// 2. Delete from DB if not default
			if (m && !m.isDefault) {
				await db.delete(localModels).where(eq(localModels.id, targetId));
				queryClient.invalidateQueries({ queryKey: ["local_models"] });
			}

			await checkAllCaches();
		},
		[updateSetting, savedModelId, checkAllCaches, availableModels, queryClient],
	);

	const inferenceMode = settingsMap?.inference_mode ?? "local";
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
			const m = availableModels.find((m) => m.id === modelId);
			if (m) localLLM.setModel(m);
			await updateSetting.mutateAsync({
				key: "local_model_id",
				value: modelId,
			});
		},
		[updateSetting, availableModels],
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
