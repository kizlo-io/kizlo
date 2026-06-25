#!/usr/bin/env node
import { lstatSync, mkdirSync, readdirSync, symlinkSync, unlinkSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

const { values } = parseArgs({ options: { target: { type: "string" } } })

if (!values.target) {
	console.error("usage: link.mjs --target /path/to/wp-content/plugins")
	process.exit(1)
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, "..")
const pluginsDir = join(repoRoot, "plugins")
const targetDir = resolve(values.target)

mkdirSync(targetDir, { recursive: true })

for (const name of readdirSync(pluginsDir)) {
	const src = join(pluginsDir, name)
	const dest = join(targetDir, name)
	const existing = lstatSync(dest, { throwIfNoEntry: false })
	if (existing) {
		if (!existing.isSymbolicLink()) {
			console.error(`refusing to overwrite non-symlink at ${dest}`)
			continue
		}
		unlinkSync(dest)
	}
	symlinkSync(src, dest, "dir")
	console.log(`linked ${name} -> ${dest}`)
}
