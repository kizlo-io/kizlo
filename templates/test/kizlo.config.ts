import { defineConfig } from "kizlo/config"

export default defineConfig({
	dir: "src/lib/kizlo",
	alias: "@/",
	dev: { local: true },
	test: { local: true },
})
