#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")

const plugin = process.argv[2]
if (!plugin) {
	console.error("usage: check-versions.mjs <plugin-name>")
	process.exit(1)
}

const pluginDir = path.join(repoRoot, "plugins", plugin)
if (!fs.existsSync(pluginDir)) {
	console.error(`plugins/${plugin} does not exist`)
	process.exit(1)
}

const constName = `${plugin.toUpperCase().replaceAll("-", "_")}_VERSION`
const read = (rel) => fs.readFileSync(path.join(pluginDir, rel), "utf8")

const phpSrc = read(`${plugin}.php`)
const headerVersion = phpSrc.match(/^\s*\*\s*Version:\s*(\S+)/m)?.[1]
const constVersion = phpSrc.match(new RegExp(`define\\('${constName}',\\s*'([^']+)'\\);`))?.[1]
const readmeStable = read("readme.txt").match(/^Stable tag:\s*(\S+)/m)?.[1]

const sources = {
	[`${plugin}.php Version:`]: headerVersion,
	[`${plugin}.php ${constName}`]: constVersion,
	"readme.txt Stable tag": readmeStable,
}

// Only treat package.json as a version source when it actually declares a
// version — pure-PHP plugins carry a package.json solely to expose a turbo
// `typecheck` task and intentionally omit `version`.
const pkgPath = path.join(pluginDir, "package.json")
if (fs.existsSync(pkgPath)) {
	const pkgVersion = JSON.parse(read("package.json")).version
	if (pkgVersion !== undefined) sources["package.json version"] = pkgVersion
}

console.log(`[${plugin}] Version sources:`)
for (const [k, v] of Object.entries(sources)) console.log(`  ${k}: ${v ?? "(missing)"}`)

const unique = new Set(Object.values(sources))
if (unique.size !== 1 || unique.has(undefined)) {
	console.error("\nVersions diverge — fix before releasing.")
	process.exit(1)
}

console.log(`\n[${plugin}] All ${Object.keys(sources).length} sources agree on v${[...unique][0]}.`)
