import { defineConfig } from "tsdown"

export default defineConfig({
	format: ["esm"],
	entry: { index: "src/index.ts" },
	outputOptions: { legalComments: "inline" },
	dts: { tsconfig: "tsconfig.build.json" },
})
