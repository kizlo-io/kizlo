import { defineConfig } from "tsdown"

const fixNextServerImport = {
	name: "fix-esm-specifiers",
	renderChunk(code: string) {
		return code.replace(/from ['"]next\/server['"]/g, `from 'next/server.js'`)
	},
}

export default defineConfig({
	unbundle: true,
	format: ["esm"],
	plugins: [fixNextServerImport],
	entry: {
		index: "src/index.ts",
		config: "src/config.ts",
		test: "src/test/index.ts",
		node: "src/integrations/node/index.ts",
		"cli/index": "src/cli/index.ts",
		"cli/wp/watchdog": "src/cli/wp/watchdog.ts",
		nextjs: "src/integrations/nextjs/index.ts",
		"nextjs/server": "src/integrations/nextjs/server.ts",
		astro: "src/integrations/astro/index.ts",
		"astro/server": "src/integrations/astro/server.ts",
		"tanstack-start": "src/integrations/tanstack-start/index.ts",
		"tanstack-start/server": "src/integrations/tanstack-start/server.ts",
	},
	copy: [{ from: "src/cli/wp/compose", to: "dist/cli/wp/compose" }],
	dts: { tsconfig: "tsconfig.build.json" },
})
