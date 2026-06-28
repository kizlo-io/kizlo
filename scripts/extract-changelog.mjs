#!/usr/bin/env node
// Prints the release notes for one version: the body of that version's
// CHANGELOG.md entry, plus a correct "Full Changelog" compare link (from the
// changelogger-generated link reference). Used by plugin-release.yml as the
// GitHub Release body, replacing GitHub's auto-generated notes — which pick the
// wrong "previous tag" in this repo's mixed tag namespaces (e.g. @kizlo/cf7@…).
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")

const plugin = process.argv[2]
const version = process.argv[3]
if (!plugin || !version) {
	console.error("usage: extract-changelog.mjs <plugin-name> <version>")
	process.exit(1)
}

const changelog = fs.readFileSync(path.join(repoRoot, "plugins", plugin, "CHANGELOG.md"), "utf8")
const esc = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// Capture the body between this version's "## [x] - date" heading and the next
// "## " heading (or end of file). No /m on the trailing `$` so the last entry
// runs to end-of-string.
const section = changelog.match(new RegExp(`\\n## \\[?${esc}\\]?[^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)`))
if (!section) {
	console.error(`no CHANGELOG.md entry found for ${plugin} ${version}`)
	process.exit(1)
}

let body = section[1].trim()

// Reference-style link the changelogger appended at the bottom of the file:
// "[x.y.z]: https://github.com/…/compare/<plugin>-v<old>...<plugin>-v<new>".
const link = changelog.match(new RegExp(`^\\[${esc}\\]:\\s*(\\S+)`, "m"))
if (link) {
	body += `\n\n**Full Changelog**: ${link[1]}`
}

process.stdout.write(`${body}\n`)
