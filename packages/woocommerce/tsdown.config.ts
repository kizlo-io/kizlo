import { defineConfig } from "tsdown"

export default defineConfig({
	format: ["esm", "cjs"],
	entry: { index: "src/index.ts" },
	dts: { tsconfig: "tsconfig.build.json" },
})
