import "#/lib/patch-fetch";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "#/App";
import { ErrorBoundary } from "#/components/error-boundary";
import { initDb } from "#/db";
import "#/styles.css";

import { SidebarProvider } from "#/context/sidebar-context";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 1000 * 60, // 1 minute
			gcTime: 1000 * 60 * 5, // 5 minutes
			retry: 1,
			refetchOnWindowFocus: false,
		},
	},
});

initDb().then(() => {
	const root = document.getElementById("root");
	if (!root) return;
	ReactDOM.createRoot(root).render(
		<React.StrictMode>
			<ErrorBoundary>
				<QueryClientProvider client={queryClient}>
					<BrowserRouter>
						<SidebarProvider>
							<App />
						</SidebarProvider>
					</BrowserRouter>
					<ReactQueryDevtools initialIsOpen={false} />
				</QueryClientProvider>
			</ErrorBoundary>
		</React.StrictMode>,
	);
});
