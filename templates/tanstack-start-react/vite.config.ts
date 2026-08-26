import { fileURLToPath } from "node:url"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// No `.env` wiring needed here: the server entry (src/lib/kizlo/server/index.ts) reads secrets through
// `process.env` on the server, and the browser client reads `import.meta.env.VITE_KIZLO_BASE_URL`, which
// Vite inlines from `.env` in dev and the host environment in production.
//
// Kizlo renders on demand (SSR) so robots.txt, sitemaps, the web manifest, and pages always reflect the
// latest WordPress content — TanStack Start ships SSR by default, so there is nothing extra to enable.
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
