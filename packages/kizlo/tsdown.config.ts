import { defineConfig } from "tsdown"

const fixNextServerImport = {
	name: "fix-esm-specifiers",
	renderChunk(code: string) {
		return code.replace(/from ['"]next\/server['"]/g, `from 'next/server.js'`)
	},
}

export default defineConfig({
	unbundle: true,
	format: ["esm", "cjs"],
	plugins: [fixNextServerImport],
	entry: {
		index: "src/index.ts",
		config: "src/config.ts",
		"cli/index": "src/cli/index.ts",
		nextjs: "src/integrations/nextjs/index.ts",
		"nextjs/server": "src/integrations/nextjs/server.ts",
	},
	dts: { tsconfig: "tsconfig.build.json" },
})
