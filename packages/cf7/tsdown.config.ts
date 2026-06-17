import { defineConfig } from "tsdown"

export default defineConfig({
	format: ["esm", "cjs"],
	entry: { index: "src/index.ts" },
	outputOptions: { legalComments: "inline" },
	dts: { tsconfig: "tsconfig.build.json" },
})
