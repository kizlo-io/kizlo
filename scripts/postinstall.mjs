#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, "..")
const pluginsDir = resolve(repoRoot, "plugins")

if (!existsSync(pluginsDir)) process.exit(0)

// Composer is optional for contributors. If it isn't installed, skip with a warning —
// they just can't run the PHP side of typecheck or the local WP stacks. CI always has
// Composer, so this skip never hides a problem there.
try {
	execFileSync("composer", ["--version"], { stdio: "ignore" })
} catch {
	console.warn("[plugins] Composer not found — skipping plugin dependency install. PHP typecheck and the WP stacks won't run locally.")
	process.exit(0)
}

// Validate + install each plugin's composer deps. PHPStan (run by `pnpm typecheck`)
// needs the WP/WC stubs, and the plugins are bind-mounted into WordPress live, so each
// one's `vendor/autoload.php` must exist before it's activated. Runs in both local and
// CI — once Composer is present, a bad composer.json or failed install is a hard error.
for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
	if (!entry.isDirectory()) continue
	const pluginDir = resolve(pluginsDir, entry.name)
	if (!existsSync(resolve(pluginDir, "composer.json"))) continue
	execFileSync("composer", ["validate", "--strict"], { cwd: pluginDir, stdio: "inherit" })
	execFileSync("composer", ["install", "--no-interaction", "--prefer-dist", "--no-progress"], { cwd: pluginDir, stdio: "inherit" })
}
