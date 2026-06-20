import { defineConfig } from "tsdown"

export default defineConfig({
	format: ["esm"],
	entry: { index: "src/index.ts", test: "src/test/index.ts" },
	dts: { tsconfig: "tsconfig.build.json" },
})
