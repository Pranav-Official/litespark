import { PanelLeftOpen } from "lucide-react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "#/components/chat/sidebar";
import ReloadPrompt from "#/components/pwa/reload-prompt";
import { useSidebar } from "#/context/sidebar-context";

export default function RootLayout() {
	const { collapsed, isMobile, toggleSidebar, closeSidebar } = useSidebar();
	const location = useLocation();
	const isChatPage = location.pathname.startsWith("/chat/");

	return (
		<div className="flex h-dvh bg-zinc-950 text-zinc-100">
			{isMobile && !collapsed && (
				<div
					className="fixed inset-0 z-40 bg-black/60"
					onClick={closeSidebar}
					aria-hidden="true"
				/>
			)}

			<Sidebar />

			<main className="flex flex-1 flex-col overflow-hidden">
				{collapsed && !isMobile && (
					<div className="flex items-center border-b border-zinc-800 px-3 py-2">
						<button
							type="button"
							onClick={toggleSidebar}
							className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
						>
							<PanelLeftOpen className="h-4 w-4" />
						</button>
					</div>
				)}

				{isMobile && !isChatPage && (
					<div className="flex items-center gap-3 border-b border-zinc-800 px-3 py-2">
						<button
							type="button"
							onClick={toggleSidebar}
							className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
						>
							<PanelLeftOpen className="h-5 w-5" />
						</button>
					</div>
				)}

				<Outlet />
			</main>
			<ReloadPrompt />
		</div>
	);
}
