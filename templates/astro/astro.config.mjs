// @ts-check
import node from "@astrojs/node"
import { defineConfig } from "astro/config"

// No `.env` wiring needed here: the server entry (src/lib/kizlo/server/index.ts) reads env through
// Astro's native `astro:env/server` (`getSecret`), which resolves `.env` in dev and the host/adapter
// environment in production.
export default defineConfig({
	// SSR everywhere so robots.txt, sitemaps, the web manifest, and pages always reflect the latest
	// WordPress content (no build-time snapshots to revalidate).
	output: "server",
	adapter: node({ mode: "standalone" }),
})
