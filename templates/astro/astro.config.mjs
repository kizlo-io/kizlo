// @ts-check
import node from "@astrojs/node"
import { defineConfig } from "astro/config"

export default defineConfig({
	// SSR everywhere so robots.txt, sitemaps, the web manifest, and pages always reflect the latest
	// WordPress content (no build-time snapshots to revalidate).
	output: "server",
	adapter: node({ mode: "standalone" }),
})
