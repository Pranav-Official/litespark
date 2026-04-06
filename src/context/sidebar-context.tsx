import { createContext, useContext, useEffect, useState } from "react";

interface SidebarContextType {
	collapsed: boolean;
	isMobile: boolean;
	openSidebar: () => void;
	closeSidebar: () => void;
	toggleSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextType | null>(null);

const LG_BREAKPOINT = 1024;

export function SidebarProvider({ children }: { children: React.ReactNode }) {
	const [isMobile, setIsMobile] = useState(
		() => window.innerWidth < LG_BREAKPOINT,
	);
	const [collapsed, setCollapsed] = useState(() => {
		const saved = localStorage.getItem("sidebar-collapsed");
		if (saved !== null) return JSON.parse(saved);
		return window.innerWidth < LG_BREAKPOINT;
	});

	useEffect(() => {
		const handleResize = () => {
			const mobile = window.innerWidth < LG_BREAKPOINT;
			setIsMobile(mobile);
			if (mobile) {
				setCollapsed(true);
			}
		};

		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, []);

	const openSidebar = () => setCollapsed(false);
	const closeSidebar = () => setCollapsed(true);
	const toggleSidebar = () => {
		const next = !collapsed;
		setCollapsed(next);
		if (!isMobile) {
			localStorage.setItem("sidebar-collapsed", JSON.stringify(next));
		}
	};

	return (
		<SidebarContext.Provider
			value={{ collapsed, isMobile, openSidebar, closeSidebar, toggleSidebar }}
		>
			{children}
		</SidebarContext.Provider>
	);
}

export function useSidebar() {
	const ctx = useContext(SidebarContext);
	if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
	return ctx;
}
