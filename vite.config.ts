import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
	plugins: [
		tsconfigPaths({ projects: ["./tsconfig.json"] }),
		tailwindcss(),
		viteReact(),
		VitePWA({
			registerType: "prompt",
			includeAssets: ["**/*.{ico,png,svg}"],
			manifest: {
				name: "Chat",
				short_name: "Chat",
				description: "AI chat assistant running locally in your browser",
				theme_color: "#0a0a0a",
				background_color: "#0a0a0a",
				display: "standalone",
				start_url: "/",
				scope: "/",
				icons: [
					{
						src: "/icon-192.png",
						sizes: "192x192",
						type: "image/png",
						purpose: "any",
					},
					{
						src: "/icon-512.png",
						sizes: "512x512",
						type: "image/png",
						purpose: "any",
					},
					{
						src: "/icon-maskable-192.png",
						sizes: "192x192",
						type: "image/png",
						purpose: "maskable",
					},
					{
						src: "/icon-maskable-512.png",
						sizes: "512x512",
						type: "image/png",
						purpose: "maskable",
					},
				],
			},
			workbox: {
				globPatterns: ["**/*.{js,css,html,ico,png,svg,wasm,data}"],
				maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
				navigateFallback: "/index.html",
				navigateFallbackDenylist: [/^\/api\//],
				runtimeCaching: [
					{
						urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
						handler: "CacheFirst",
						options: {
							cacheName: "jsdelivr-cdn",
							expiration: {
								maxEntries: 50,
								maxAgeSeconds: 60 * 60 * 24 * 365,
							},
							cacheableResponse: {
								statuses: [0, 200],
							},
						},
					},
					{
						urlPattern: /^https:\/\/huggingface\.co\/.*/i,
						handler: "CacheFirst",
						options: {
							cacheName: "huggingface-models",
							expiration: {
								maxEntries: 20,
								maxAgeSeconds: 60 * 60 * 24 * 365,
							},
							cacheableResponse: {
								statuses: [0, 200],
							},
						},
					},
				],
			},
			devOptions: {
				enabled: true,
			},
		}),
	],
	server: {
		fs: {
			allow: [
				path.resolve("."),
				path.resolve("node_modules/@electric-sql/pglite"),
			],
		},
	},
	optimizeDeps: {
		exclude: ["@electric-sql/pglite"],
	},
	build: {
		rollupOptions: {
			output: {
				assetFileNames: (assetInfo) => {
					if (
						assetInfo.name?.endsWith(".wasm") ||
						assetInfo.name?.endsWith(".data")
					) {
						return "assets/[name][extname]";
					}
					return "assets/[name]-[hash][extname]";
				},
			},
		},
	},
	assetsInclude: ["**/*.wasm", "**/*.data"],
});
