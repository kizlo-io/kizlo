#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")

const plugin = process.argv[2]
const version = process.argv[3]

if (!plugin || !version) {
	console.error("usage: sync-versions.mjs <plugin-name> <version>")
	process.exit(1)
}

const pluginDir = path.join(repoRoot, "plugins", plugin)
if (!fs.existsSync(pluginDir)) {
	console.error(`plugins/${plugin} does not exist`)
	process.exit(1)
}

const constName = `${plugin.toUpperCase().replaceAll("-", "_")}_VERSION`

const pkgPath = path.join(pluginDir, "package.json")
if (fs.existsSync(pkgPath)) {
	const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"))
	pkg.version = version
	fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, "\t")}\n`)
	console.log(`Synced package.json → ${version}`)
} else {
	console.log("Skipping package.json (not present)")
}

const updates = [
	{
		file: `${plugin}.php`,
		replacements: [
			[/^(\s*\*\s*Version:\s*)(\S+)/m, `$1${version}`],
			[new RegExp(`define\\('${constName}',\\s*'[^']+'\\);`), `define('${constName}', '${version}');`],
		],
	},
	{
		file: "readme.txt",
		replacements: [[/^(Stable tag:\s*).+$/m, `$1${version}`]],
	},
]

for (const { file, replacements } of updates) {
	const full = path.join(pluginDir, file)
	let content = fs.readFileSync(full, "utf8")
	for (const [pattern, replacement] of replacements) {
		if (!pattern.test(content)) {
			console.error(`${file}: pattern ${pattern} not found — aborting`)
			process.exit(1)
		}
		content = content.replace(pattern, replacement)
	}
	fs.writeFileSync(full, content)
	console.log(`Synced ${file} → ${version}`)
}
