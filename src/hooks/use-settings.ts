import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { eq } from "drizzle-orm";
import { db } from "#/db";
import { settings } from "#/db/schema";

export function useSetting(key: string) {
	return useQuery({
		queryKey: ["settings", key],
		queryFn: async () => {
			const result = await db
				.select()
				.from(settings)
				.where(eq(settings.key, key));
			return result[0]?.value ?? null;
		},
	});
}

export function useAllSettings() {
	return useQuery({
		queryKey: ["settings"],
		queryFn: async () => {
			const result = await db.select().from(settings);
			return result.reduce<Record<string, string>>((acc, row) => {
				acc[row.key] = row.value;
				return acc;
			}, {});
		},
	});
}

export function useUpdateSetting() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ key, value }: { key: string; value: string }) => {
			await db.insert(settings).values({ key, value }).onConflictDoUpdate({
				target: settings.key,
				set: { value },
			});
		},
		onMutate: async ({ key, value }) => {
			await queryClient.cancelQueries({ queryKey: ["settings"] });
			const previousSettings = queryClient.getQueryData<Record<string, string>>(
				["settings"],
			);
			queryClient.setQueryData<Record<string, string>>(["settings"], (old) => {
				if (old && typeof old === "object") {
					return { ...old, [key]: value };
				}
				return old;
			});
			return { previousSettings };
		},
		onError: (_err, _newSetting, context) => {
			queryClient.setQueryData(["settings"], context?.previousSettings);
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ["settings"] });
		},
	});
}

export function useActiveProvider() {
	const { data } = useQuery({
		queryKey: ["settings"],
		queryFn: async () => {
			const result = await db.select().from(settings);
			return result.reduce<Record<string, string>>((acc, row) => {
				acc[row.key] = row.value;
				return acc;
			}, {});
		},
		select: (settingsMap) => ({
			provider: settingsMap.active_provider ?? "openai",
			apiKey: settingsMap.api_key ?? "",
			model: settingsMap.model ?? "gpt-4o",
			hasKey: !!settingsMap.api_key,
		}),
	});

	return (
		data ?? {
			provider: "openai",
			apiKey: "",
			model: "gpt-4o",
			hasKey: false,
		}
	);
}
