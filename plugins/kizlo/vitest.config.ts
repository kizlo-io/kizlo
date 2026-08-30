import { defineConfig } from "vitest/config"

export default defineConfig({
	resolve: {
		dedupe: ["react", "react-dom"],
		alias: {
			"@": new URL("./src/js", import.meta.url).pathname,
		},
	},
})
