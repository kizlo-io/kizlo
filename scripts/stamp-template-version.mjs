import fs from "node:fs"
import path from "node:path"

/**
 * Stamp the current kizlo-family versions into every template's `template.json`, pinning each
 * kizlo-family entry in the manifest's `dependencies`/`devDependencies` to a caret range of that
 * package's own version (and guaranteeing `kizlo` itself is pinned). This is the source of truth for
 * the versions a scaffolded project installs.
 *
 * Each package is independently versioned, so every `@kizlo/*` entry gets pinned to its own version —
 * not to `kizlo`'s. Versions are read from each workspace package's `package.json` after
 * `changeset version` has bumped them (see the root `version` script). The changesets action then
 * commits the stamped manifests into the Version Packages PR; merging that PR is what lands the pins on
 * `main`, which is where `create`/`init` fetch templates from.
 *
 * Left untouched on purpose: the `env` key names (static wiring data, not versions) and any third-party
 * dependency pins. `minCli` is also left alone — it's a manually set compatibility floor a developer
 * bumps only when a manifest change older CLIs can't apply lands, not the moving release version.
 *
 * Fails loud: any missing file, unreadable version, bad JSON, failed write, a kizlo-family dep with no
 * matching workspace package, or a run that stamps zero manifests exits non-zero so the release step
 * stops instead of shipping a stale or bogus pin.
 */
const ROOT = process.cwd()
const PACKAGES_DIR = path.join(ROOT, "packages")
const TEMPLATES_DIR = path.join(ROOT, "templates")

function fail(message) {
	console.error(`stamp-template-version: ${message}`)
	process.exit(1)
}

function isKizloFamily(name) {
	return name === "kizlo" || name.startsWith("@kizlo/")
}

// Build a name -> "^version" map from every workspace package, so each kizlo-family dep can be pinned
// to its own independently-versioned release rather than kizlo's.
if (!fs.existsSync(PACKAGES_DIR)) fail(`packages directory not found at ${path.relative(ROOT, PACKAGES_DIR)}`)

const ranges = new Map()
for (const dir of fs.readdirSync(PACKAGES_DIR)) {
	const pkgPath = path.join(PACKAGES_DIR, dir, "package.json")
	if (!fs.existsSync(pkgPath)) continue

	let pkg
	try {
		pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"))
	} catch (error) {
		fail(`invalid JSON in ${path.relative(ROOT, pkgPath)}: ${error.message}`)
	}
	if (!isKizloFamily(pkg.name)) continue
	if (typeof pkg.version !== "string" || !/^\d+\.\d+\.\d+/.test(pkg.version)) {
		fail(`${path.relative(ROOT, pkgPath)} has no valid semver version (got ${JSON.stringify(pkg.version)})`)
	}
	ranges.set(pkg.name, `^${pkg.version}`)
}

const kizloRange = ranges.get("kizlo")
if (!kizloRange) fail(`no workspace package named "kizlo" found under ${path.relative(ROOT, PACKAGES_DIR)}`)

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

	// Pin every kizlo-family package (kizlo + @kizlo/*) across both dependency maps to its own version;
	// leave third-party pins as they are. Guarantee kizlo itself is present so a template can't ship
	// without its pin.
	manifest.dependencies ??= {}
	let pinned = 0
	for (const map of [manifest.dependencies, manifest.devDependencies]) {
		if (!map) continue
		for (const dep of Object.keys(map)) {
			if (!isKizloFamily(dep)) continue
			const range = ranges.get(dep)
			if (!range) fail(`${path.relative(ROOT, manifestPath)} depends on "${dep}" but no matching workspace package exists`)
			map[dep] = range
			pinned++
		}
	}
	if (manifest.dependencies.kizlo !== kizloRange) {
		manifest.dependencies.kizlo = kizloRange
		pinned++
	}

	try {
		fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`)
	} catch (error) {
		fail(`could not write ${path.relative(ROOT, manifestPath)}: ${error.message}`)
	}
	console.log(`stamp-template-version: ${path.relative(ROOT, manifestPath)} -> ${pinned} dep(s) pinned`)
	stamped++
}

if (stamped === 0) fail(`no template manifests found under ${path.relative(ROOT, TEMPLATES_DIR)} — nothing stamped`)
console.log(`stamp-template-version: stamped ${stamped} manifest(s)`)
