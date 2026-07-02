import { defineConfig } from "kizlo/config"
import { defineFixture } from "kizlo/test"

export default defineConfig({
	dir: "src/lib/kizlo",
	alias: "@/",
	dev: {
		path: "wordpress",
		fixtures: [defineFixture({ name: "kizlo-core", plugins: [{ path: "../plugins/kizlo" }] })],
	},
})
