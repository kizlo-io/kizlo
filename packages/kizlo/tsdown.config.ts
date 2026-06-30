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
		"cli/index": "src/cli/index.ts",
		// Spawned by path (never imported), so it needs an explicit entry to land in dist.
		"cli/wp/watchdog": "src/cli/wp/watchdog.ts",
		nextjs: "src/integrations/nextjs/index.ts",
		"nextjs/server": "src/integrations/nextjs/server.ts",
	},
	// The compose file is read at runtime via an absolute path, so it must land
	// in dist alongside the bundled wp orchestration (seed JSON is imported and
	// bundles automatically).
	copy: [{ from: "src/cli/wp/compose", to: "dist/cli/wp/compose" }],
	dts: { tsconfig: "tsconfig.build.json" },
})
