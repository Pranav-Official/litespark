import { useRegisterSW } from "virtual:pwa-register/react";
import { RefreshCw, X } from "lucide-react";

export default function ReloadPrompt() {
	const {
		offlineReady: [offlineReady, setOfflineReady],
		needRefresh: [needRefresh, setNeedRefresh],
		updateServiceWorker,
	} = useRegisterSW({
		onRegistered(r) {
			console.log("SW Registered:", r);
		},
		onRegisterError(error) {
			console.log("SW registration error", error);
		},
	});

	const close = () => {
		setOfflineReady(false);
		setNeedRefresh(false);
	};

	if (!offlineReady && !needRefresh) return null;

	return (
		<div className="fixed bottom-4 right-4 z-50 flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4 shadow-2xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-4">
			<div className="flex flex-col gap-1">
				<p className="text-sm font-medium text-zinc-100">
					{offlineReady ? "App ready to work offline" : "New content available"}
				</p>
				{!offlineReady && (
					<p className="text-xs text-zinc-500">
						Reload to see the latest version
					</p>
				)}
			</div>
			<div className="flex items-center gap-2">
				{needRefresh && (
					<button
						type="button"
						onClick={() => updateServiceWorker(true)}
						className="flex items-center gap-2 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-900 transition-colors hover:bg-white"
					>
						<RefreshCw className="h-3.5 w-3.5" />
						Reload
					</button>
				)}
				<button
					type="button"
					onClick={close}
					className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
					aria-label="Close"
				>
					<X className="h-4 w-4" />
				</button>
			</div>
		</div>
	);
}
