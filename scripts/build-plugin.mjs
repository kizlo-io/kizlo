#!/usr/bin/env node
import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")

const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const plugin = args.find((a) => !a.startsWith("--"))

if (!plugin) {
	console.error("usage: build-plugin.mjs <plugin-name> [--dry-run]")
	process.exit(1)
}

const pluginDir = path.join(repoRoot, "plugins", plugin)
if (!fs.existsSync(pluginDir)) {
	console.error(`plugins/${plugin} does not exist`)
	process.exit(1)
}

// The plugin header `Version:` line is the canonical version source — every
// plugin has one, whereas package.json is only present for plugins that ship
// JS assets.
const phpSrc = fs.readFileSync(path.join(pluginDir, `${plugin}.php`), "utf8")
const versionMatch = phpSrc.match(/^\s*\*\s*Version:\s*(\S+)/m)
if (!versionMatch) {
	console.error(`could not read Version from plugins/${plugin}/${plugin}.php header`)
	process.exit(1)
}
const version = versionMatch[1]
const hasPackageJson = fs.existsSync(path.join(pluginDir, "package.json"))
const distDir = path.join(pluginDir, "dist")
const stageDir = path.join(distDir, plugin)
const zipFile = path.join(distDir, `${plugin}-v${version}.zip`)

const distignorePath = path.join(pluginDir, ".distignore")
const excludes = fs.existsSync(distignorePath)
	? fs
			.readFileSync(distignorePath, "utf8")
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line && !line.startsWith("#"))
	: []

function isExcluded(relPath) {
	// Always skip the build output directory so a re-run doesn't try to package
	// a previous build's dist/ into the new one.
	if (relPath === "dist" || relPath.startsWith("dist/")) return true
	return excludes.some((pattern) => relPath === pattern || relPath.startsWith(`${pattern}/`))
}

function walk(dir, baseRel = "") {
	const out = []
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const rel = baseRel ? `${baseRel}/${entry.name}` : entry.name
		if (isExcluded(rel)) continue
		const abs = path.join(dir, entry.name)
		if (entry.isDirectory()) {
			out.push(...walk(abs, rel))
		} else {
			out.push(rel)
		}
	}
	return out
}

if (!dryRun) {
	console.log(`[${plugin}] Installing prod composer deps…`)
	execSync("composer install --no-dev --optimize-autoloader --classmap-authoritative --no-interaction", {
		cwd: pluginDir,
		stdio: "inherit",
	})

	if (hasPackageJson) {
		console.log(`[${plugin}] Building JS assets…`)
		execSync(`pnpm exec turbo run build --filter=./plugins/${plugin}`, { cwd: repoRoot, stdio: "inherit" })
	}
}

const files = walk(pluginDir)

if (dryRun) {
	console.log(`Would package ${files.length} files into ${plugin}-v${version}.zip:`)
	for (const f of files) console.log(`  ${f}`)
	process.exit(0)
}

fs.rmSync(distDir, { recursive: true, force: true })
fs.mkdirSync(stageDir, { recursive: true })

for (const rel of files) {
	const src = path.join(pluginDir, rel)
	const dst = path.join(stageDir, rel)
	fs.mkdirSync(path.dirname(dst), { recursive: true })
	fs.copyFileSync(src, dst)
}

execSync(`cd ${JSON.stringify(distDir)} && zip -qr ${JSON.stringify(zipFile)} ${plugin}`, {
	stdio: "inherit",
	shell: "/bin/bash",
})

console.log(`\nBuilt ${path.relative(repoRoot, zipFile)}`)

// Restore dev composer deps after packaging — only relevant for local runs.
// In CI the workspace is ephemeral, so skip the reinstall.
if (!process.env.CI) {
	console.log(`[${plugin}] Restoring dev composer deps…`)
	execSync("composer install --no-interaction", { cwd: pluginDir, stdio: "inherit" })
}
