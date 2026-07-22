import fs from "node:fs"
import path from "node:path"

/**
 * Stamp the current `kizlo` version into every template's `template.json` as `kizloVersion`.
 *
 * Runs as part of `changeset version` (see the root `version` script), so it reads the version that
 * `changeset version` has just written to `packages/kizlo/package.json` and pins each template to a
 * caret range of it. The changesets action then commits the stamped manifests into the Version
 * Packages PR; merging that PR is what lands the pin on `main`, which is where `create`/`init` fetch
 * templates from.
 *
 * Fails loud: any missing file, unreadable version, bad JSON, failed write, or a run that stamps
 * zero manifests exits non-zero so the release step stops instead of shipping a stale pin.
 */
const ROOT = process.cwd()
const KIZLO_PKG = path.join(ROOT, "packages/kizlo/package.json")
const TEMPLATES_DIR = path.join(ROOT, "templates")

function fail(message) {
	console.error(`stamp-template-version: ${message}`)
	process.exit(1)
}

let version
try {
	version = JSON.parse(fs.readFileSync(KIZLO_PKG, "utf8")).version
} catch (error) {
	fail(`could not read ${path.relative(ROOT, KIZLO_PKG)}: ${error.message}`)
}
if (typeof version !== "string" || !/^\d+\.\d+\.\d+/.test(version)) {
	fail(`packages/kizlo has no valid semver version (got ${JSON.stringify(version)})`)
}
const range = `^${version}`

if (!fs.existsSync(TEMPLATES_DIR)) fail(`templates directory not found at ${path.relative(ROOT, TEMPLATES_DIR)}`)

let stamped = 0
for (const name of fs.readdirSync(TEMPLATES_DIR)) {
	const manifestPath = path.join(TEMPLATES_DIR, name, "template.json")
	if (!fs.existsSync(manifestPath)) continue

	let manifest
	try {
		manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
	} catch (error) {
		fail(`invalid JSON in ${path.relative(ROOT, manifestPath)}: ${error.message}`)
	}

	manifest.kizloVersion = range
	try {
		fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`)
	} catch (error) {
		fail(`could not write ${path.relative(ROOT, manifestPath)}: ${error.message}`)
	}
	console.log(`stamp-template-version: ${path.relative(ROOT, manifestPath)} -> kizloVersion ${range}`)
	stamped++
}

if (stamped === 0) fail(`no template manifests found under ${path.relative(ROOT, TEMPLATES_DIR)} — nothing stamped`)
console.log(`stamp-template-version: stamped ${stamped} manifest(s) with ${range}`)
