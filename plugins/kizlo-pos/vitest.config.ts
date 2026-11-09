import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
	resolve: { dedupe: ["react", "react-dom"], alias: { "@": fileURLToPath(new URL("./src/js", import.meta.url)) } },
})
