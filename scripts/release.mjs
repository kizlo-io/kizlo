#!/usr/bin/env node
import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")

const plugin = process.argv.slice(2).find((a) => !a.startsWith("-"))
const dryRun = process.argv.includes("--dry-run")
const prereleaseArg = process.argv.find((a) => a.startsWith("--prerelease="))
const prerelease = prereleaseArg ? prereleaseArg.slice("--prerelease=".length) : ""

if (!plugin) {
	console.error("usage: release.mjs <plugin-name> [--prerelease=<suffix>] [--dry-run]")
	process.exit(1)
}

const pluginDir = path.join(repoRoot, "plugins", plugin)
if (!fs.existsSync(pluginDir)) {
	console.error(`plugins/${plugin} does not exist`)
	process.exit(1)
}

// The version is owned entirely by the accumulated change files: significance
// in the files decides the bump, so there is no manual bump argument to get
// out of sync with the changelog. Prereleases are the one exception, via the
// changelogger-native --prerelease suffix.
const changeloggerBin = path.join(pluginDir, "vendor/bin/changelogger")
if (!fs.existsSync(changeloggerBin)) {
	console.error(
		`plugins/${plugin} has no changelogger — run:\n` + `  (cd plugins/${plugin} && composer require --dev automattic/jetpack-changelogger)`,
	)
	process.exit(1)
}

// The PHP header is the canonical version source (build-plugin.mjs reads it
// too) — used here only for the bump log line.
const phpPath = path.join(pluginDir, `${plugin}.php`)
const currentVersion = fs.readFileSync(phpPath, "utf8").match(/^\s*\*\s*Version:\s*(\S+)/m)?.[1]
if (!currentVersion) {
	console.error(`could not read current Version from plugins/${plugin}/${plugin}.php`)
	process.exit(1)
}

function sh(cmd, opts = {}) {
	return execSync(cmd, { cwd: repoRoot, stdio: "inherit", ...opts })
}

function shCapture(cmd) {
	return execSync(cmd, { cwd: repoRoot }).toString().trim()
}

function changelogger(args, opts = {}) {
	return execSync(`${changeloggerBin} ${args}`, { cwd: pluginDir, ...opts })
}

if (dryRun) {
	console.log("DRY RUN — skipping branch/clean-tree guards, pre-release checks, and git commit/tag/push.\n")
} else {
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
}

const changesDir = path.join(pluginDir, "changelog")
const changeFiles = fs.existsSync(changesDir) ? fs.readdirSync(changesDir).filter((f) => !f.startsWith(".")) : []
if (changeFiles.length === 0) {
	console.error(
		`no change files in plugins/${plugin}/changelog — nothing to release.\n` +
			`Add one in a PR with: (cd plugins/${plugin} && vendor/bin/changelogger add)`,
	)
	process.exit(1)
}

changelogger("validate", { stdio: "inherit" })

const preFlag = prerelease ? `--prerelease=${prerelease}` : ""
const version = changelogger(`version next ${preFlag}`).toString().trim()

const tag = `${plugin}-v${version}`
const existingTag = shCapture(`git tag --list ${tag}`)
if (existingTag) {
	console.error(`tag '${tag}' already exists`)
	process.exit(1)
}

const hasPackageJson = fs.existsSync(path.join(pluginDir, "package.json"))

if (dryRun) {
	console.log("(dry run) skipping pre-release typecheck/build + biome check.")
} else {
	console.log(`Pre-release checks for ${plugin}…`)
	if (hasPackageJson) {
		sh(`pnpm exec turbo run typecheck build --filter=./plugins/${plugin}`)
	}
	sh("pnpm check")
}

console.log(`Bumping ${plugin}: ${currentVersion} → ${version}…`)
// Compile the change files into CHANGELOG.md (this deletes them), then mirror
// the new entry into the WordPress readme.txt changelog section.
changelogger(`write --use-version=${version} --yes`, { stdio: "inherit" })
sh(`node scripts/changelog-to-readme.mjs ${plugin}`)
sh(`node scripts/sync-versions.mjs ${plugin} ${version}`)
sh(`node scripts/check-versions.mjs ${plugin}`)

const filesToAdd = [`plugins/${plugin}/${plugin}.php`, `plugins/${plugin}/readme.txt`]
if (hasPackageJson) {
	filesToAdd.push(`plugins/${plugin}/package.json`)
}
// CHANGELOG.md plus the changelog/ dir (`-A` stages the change-file deletions).
filesToAdd.push(`plugins/${plugin}/CHANGELOG.md`, `plugins/${plugin}/changelog`)

if (dryRun) {
	console.log("\n(dry run) would now run:")
	console.log(`  git add -A ${filesToAdd.join(" ")}`)
	console.log(`  git commit -m "release(${plugin}): v${version}"`)
	console.log(`  git tag ${tag}`)
	console.log(`  git push && git push origin ${tag}`)
	console.log(`\nDry run complete for ${tag}. Inspect the working tree, then revert it.`)
	process.exit(0)
}

sh(`git add -A ${filesToAdd.join(" ")}`)
sh(`git commit --no-verify -m "release(${plugin}): v${version}"`)
sh(`git tag ${tag}`)

console.log(`\nPushing commit + tag…`)
sh("git push")
sh(`git push origin ${tag}`)

console.log(`\nReleased ${tag}. plugin-release.yml will build and publish the GitHub Release.`)
