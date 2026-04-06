import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "#/App";
import { initDb } from "#/db";
import "#/styles.css";

import { SidebarProvider } from "#/context/sidebar-context";

const queryClient = new QueryClient();

initDb().then(() => {
	const root = document.getElementById("root");
	if (!root) return;
	ReactDOM.createRoot(root).render(
		<React.StrictMode>
			<QueryClientProvider client={queryClient}>
				<BrowserRouter>
					<SidebarProvider>
						<App />
					</SidebarProvider>
				</BrowserRouter>
			</QueryClientProvider>
		</React.StrictMode>,
	);
});
