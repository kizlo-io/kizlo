#!/usr/bin/env node
// Mirrors the newest CHANGELOG.md entry (written by jetpack-changelogger,
// keepachangelog format) into the `== Changelog ==` section of readme.txt.
// readme.txt shows only the latest version plus a link to the full CHANGELOG.md;
// CHANGELOG.md stays the source of truth and complete history.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")

const plugin = process.argv[2]
if (!plugin) {
	console.error("usage: changelog-to-readme.mjs <plugin-name>")
	process.exit(1)
}

const pluginDir = path.join(repoRoot, "plugins", plugin)
const changelogMd = fs.readFileSync(path.join(pluginDir, "CHANGELOG.md"), "utf8")
const readmePath = path.join(pluginDir, "readme.txt")
let readme = fs.readFileSync(readmePath, "utf8")

// Grab the first "## <version> - date" block (the newest entry), up to the
// next "## " heading or end of file. No /m flag, so the trailing `$` anchors to
// end-of-string for the last entry rather than end-of-line.
const entryRe = /\n## \[?(?<version>[^\]\s]+)\]?[^\n]*\n(?<body>[\s\S]*?)(?=\n## |$)/
const match = changelogMd.match(entryRe)
if (!match) {
	console.error("could not find a version entry in CHANGELOG.md")
	process.exit(1)
}
const version = match.groups.version

// Convert keepachangelog "### Type\n- item" into WordPress "* Type: item".
const bullets = []
let currentType = ""
for (const line of match.groups.body.split("\n")) {
	const heading = line.match(/^### (.+)$/)
	if (heading) {
		currentType = heading[1].trim()
		continue
	}
	const item = line.match(/^[-*] (.+)$/)
	if (item) {
		bullets.push(currentType ? `* ${currentType}: ${item[1].trim()}` : `* ${item[1].trim()}`)
	}
}
if (bullets.length === 0) {
	console.error(`no changelog bullets parsed for ${version}`)
	process.exit(1)
}

const block = `= ${version} =\n${bullets.join("\n")}`

// readme.txt carries only the latest entry plus a link to the full history
// (the WooCommerce/WordPress.org convention — the directory truncates long
// changelogs, and CHANGELOG.md is the complete record). So replace the whole
// "== Changelog ==" section rather than stacking entries.
const fullChangelogUrl = `https://github.com/kizlo-io/kizlo/blob/main/plugins/${plugin}/CHANGELOG.md`
const marker = "== Changelog =="
const start = readme.indexOf(marker)
if (start === -1) {
	console.error("readme.txt has no '== Changelog ==' section")
	process.exit(1)
}
// The section ends at the next "== Heading ==" or end of file.
const rest = readme.slice(start + marker.length)
const nextHeaderRel = rest.search(/\n== .+ ==/)
const end = nextHeaderRel === -1 ? readme.length : start + marker.length + nextHeaderRel

const newSection = `${marker}\n\n${block}\n\n[See the full changelog](${fullChangelogUrl}).\n`
const tail = end === readme.length ? "" : readme.slice(end).replace(/^\n+/, "\n")
readme = readme.slice(0, start) + newSection + tail
fs.writeFileSync(readmePath, readme)
console.log(`Mirrored ${version} into ${plugin}/readme.txt (latest entry + full-changelog link)`)
