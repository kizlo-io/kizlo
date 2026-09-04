import { defineConfig } from "tsdown"

export default defineConfig({
	format: ["esm"],
	entry: { index: "src/index.ts", test: "src/test/index.ts" },
	outputOptions: { legalComments: "inline" },
	dts: { tsconfig: "tsconfig.build.json" },
})
