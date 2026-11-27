import { fileURLToPath } from "node:url"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// The public WordPress URL is inlined from VITE_KIZLO_WP_URL; private service credentials stay outside browser code.
export default defineConfig({
	resolve: {
		// The `@/*` alias the routes import through. tsconfig `paths` only tells the type checker; Vite needs
		// this to resolve the same imports for dev pre-bundling and the build.
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	plugins: [
		// `tanstackStart()` must come before `viteReact()`.
		tanstackStart(),
		viteReact(),
	],
})
