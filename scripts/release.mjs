#!/usr/bin/env node
import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")

const plugin = process.argv[2]
const bump = process.argv[3]

if (!plugin || !bump) {
	console.error("usage: release.mjs <plugin-name> <patch|minor|major|x.y.z[-pre]>")
	process.exit(1)
}

const pluginDir = path.join(repoRoot, "plugins", plugin)
if (!fs.existsSync(pluginDir)) {
	console.error(`plugins/${plugin} does not exist`)
	process.exit(1)
}

const semverRe = /^\d+\.\d+\.\d+(-[\w.-]+)?$/
const bumpKeywords = new Set(["patch", "minor", "major"])

// The PHP header is the canonical version source (build-plugin.mjs reads it
// too) — every plugin has one, even pure-PHP ones without package.json.
const phpPath = path.join(pluginDir, `${plugin}.php`)
const currentVersion = fs.readFileSync(phpPath, "utf8").match(/^\s*\*\s*Version:\s*(\S+)/m)?.[1]
if (!currentVersion) {
	console.error(`could not read current Version from plugins/${plugin}/${plugin}.php`)
	process.exit(1)
}

function nextVersion(current, kind) {
	const m = current.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/)
	if (!m) throw new Error(`current version '${current}' is not a recognised semver`)
	const major = +m[1]
	const minor = +m[2]
	const patch = +m[3]
	const pre = m[4]

	if (pre) {
		// Prerelease cycle: bump the trailing numeric segment regardless of kind.
		// X.Y.Z hasn't shipped yet, so iterating means a new prerelease, not a new
		// patch/minor/major. To graduate, pass an explicit version.
		const parts = pre.split(".")
		const last = parts.length - 1
		if (/^\d+$/.test(parts[last])) {
			parts[last] = String(+parts[last] + 1)
		} else {
			parts.push("1")
		}
		return `${major}.${minor}.${patch}-${parts.join(".")}`
	}

	if (kind === "major") return `${major + 1}.0.0`
	if (kind === "minor") return `${major}.${minor + 1}.0`
	return `${major}.${minor}.${patch + 1}`
}

let version
if (bumpKeywords.has(bump)) {
	version = nextVersion(currentVersion, bump)
	const isPre = currentVersion.includes("-")
	if (isPre && bump !== "patch") {
		console.log(`Note: current ${currentVersion} is a prerelease — bumping the prerelease counter and ignoring '${bump}'.`)
	}
} else if (semverRe.test(bump)) {
	version = bump
} else {
	console.error(`'${bump}' is not 'patch', 'minor', 'major', or a semver string`)
	process.exit(1)
}

function sh(cmd, opts = {}) {
	return execSync(cmd, { cwd: repoRoot, stdio: "inherit", ...opts })
}

function shCapture(cmd) {
	return execSync(cmd, { cwd: repoRoot }).toString().trim()
}

const branch = shCapture("git rev-parse --abbrev-ref HEAD")
if (branch !== "main") {
	console.error(`refusing to release from branch '${branch}' (must be 'main')`)
	process.exit(1)
}

const dirty = shCapture("git status --porcelain")
if (dirty) {
	console.error("working tree is dirty — commit or stash first")
	process.exit(1)
}

const tag = `${plugin}-v${version}`
const existingTag = shCapture(`git tag --list ${tag}`)
if (existingTag) {
	console.error(`tag '${tag}' already exists`)
	process.exit(1)
}

const hasPackageJson = fs.existsSync(path.join(pluginDir, "package.json"))

console.log(`Pre-release checks for ${plugin}…`)
if (hasPackageJson) {
	sh(`pnpm exec turbo run typecheck build --filter=./plugins/${plugin}`)
}
sh("pnpm check")

console.log(`Bumping ${plugin}: ${currentVersion} → ${version}…`)
sh(`node scripts/sync-versions.mjs ${plugin} ${version}`)
sh(`node scripts/check-versions.mjs ${plugin}`)

const filesToAdd = [`plugins/${plugin}/${plugin}.php`, `plugins/${plugin}/readme.txt`]
if (hasPackageJson) {
	filesToAdd.push(`plugins/${plugin}/package.json`)
}
sh(`git add ${filesToAdd.join(" ")}`)
sh(`git commit -m "release(${plugin}): v${version}"`)
sh(`git tag ${tag}`)

console.log(`\nPushing commit + tag…`)
sh("git push")
sh(`git push origin ${tag}`)

console.log(`\nReleased ${tag}. plugin-release.yml will build and publish the GitHub Release.`)
