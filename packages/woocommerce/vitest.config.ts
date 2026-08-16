import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const HERE = fileURLToPath(new URL(".", import.meta.url))
const REPO_ROOT = resolve(HERE, "../..")

/**
 * Aliases point every workspace import at source so tests run without a build.
 *
 * `kizlo/test-harness` is not a published entry and cannot become one: it constructs the generated
 * client, whose `declare module "kizlo"` would register this repo's WordPress client as every
 * consuming app's. See `packages/kizlo/src/test/harness.ts`. Reaching it by alias keeps it a
 * source-only concern the build never sees.
 */
const WORKSPACE_ALIASES: Record<string, string> = {
	"kizlo/test-harness": resolve(REPO_ROOT, "packages/kizlo/src/test/harness.ts"),
	"kizlo/test": resolve(REPO_ROOT, "packages/kizlo/src/test/index.ts"),
	kizlo: resolve(REPO_ROOT, "packages/kizlo/src/index.ts"),
	"@kizlo/shared": resolve(REPO_ROOT, "packages/shared/src/index.ts"),
}

export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
		testTimeout: 30_000,
	},
	resolve: { alias: WORKSPACE_ALIASES },
})
