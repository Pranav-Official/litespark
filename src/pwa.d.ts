declare module "virtual:pwa-register/react" {
	import type { Dispatch, SetStateAction } from "react";
	import type { RegisterSWOptions } from "vite-plugin-pwa/types";

	export type { RegisterSWOptions };

	export function useRegisterSW(options?: RegisterSWOptions): {
		offlineReady: [boolean, Dispatch<SetStateAction<boolean>>];
		needRefresh: [boolean, Dispatch<SetStateAction<boolean>>];
		updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
	};
}
