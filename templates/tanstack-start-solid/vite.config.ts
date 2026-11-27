import { fileURLToPath } from "node:url"
import { tanstackStart } from "@tanstack/solid-start/plugin/vite"
import { defineConfig } from "vite"
import viteSolid from "vite-plugin-solid"

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
		// `tanstackStart()` must come before `viteSolid()`.
		tanstackStart(),
		viteSolid({ ssr: true }),
	],
})
