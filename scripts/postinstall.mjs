#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

if (process.env.CI) process.exit(0)

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, "..")

// Install each plugin's composer deps so PHPStan (run by `pnpm typecheck`) has
// its WP/WC stubs. Best-effort: a contributor without PHP/Composer gets a
// warning, not a hard failure — they just can't run the PHP side of typecheck.
const pluginsDir = resolve(repoRoot, "plugins")
if (existsSync(pluginsDir)) {
	for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue
		const pluginDir = resolve(pluginsDir, entry.name)
		if (!existsSync(resolve(pluginDir, "composer.json"))) continue
		try {
			execFileSync("composer", ["install", "--no-interaction", "--quiet"], { cwd: pluginDir, stdio: "inherit" })
		} catch {
			console.warn(`[plugins] composer install failed for ${entry.name} — PHP typecheck will not run locally. Is Composer/PHP installed?`)
		}
	}
}

// Layer .env.local (KEY=VALUE) onto process.env without overriding existing vars.
const envFile = resolve(repoRoot, ".env.local")
if (existsSync(envFile)) {
	for (const line of readFileSync(envFile, "utf8").split("\n")) {
		const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i)
		if (!m) continue
		const [, key, raw] = m
		if (process.env[key] !== undefined) continue
		process.env[key] = raw.replace(/^["']|["']$/g, "")
	}
}

const target = process.env.KIZLO_WP_PLUGINS_DIR
if (!target) {
	console.log("\n[kizlo-wordpress] Set KIZLO_WP_PLUGINS_DIR in .env.local to auto-link plugins/* into WordPress.")
	console.log("                  See .env.example. Skipping link step.\n")
	process.exit(0)
}

execFileSync("node", [resolve(__dirname, "link.mjs"), "--target", target], { cwd: repoRoot, stdio: "inherit" })
