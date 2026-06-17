import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const HERE = fileURLToPath(new URL(".", import.meta.url))
const REPO_ROOT = resolve(HERE, "../..")

// Aliases point every workspace import at source so tests run without a build.
// Update this list when adding a new internal package that tests need to reach.
const WORKSPACE_ALIASES: Record<string, string> = {
	"@kizlo/test": resolve(REPO_ROOT, "packages/test/src/index.ts"),
	kizlo: resolve(REPO_ROOT, "packages/kizlo/src/index.ts"),
	"@kizlo/cf7": resolve(REPO_ROOT, "packages/cf7/src/index.ts"),
	"@kizlo/woocommerce": resolve(REPO_ROOT, "packages/woocommerce/src/index.ts"),
	"@kizlo/shared": resolve(REPO_ROOT, "packages/shared/src/index.ts"),
}

export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
		testTimeout: 15_000,
	},
	resolve: { alias: WORKSPACE_ALIASES },
})
