#!/usr/bin/env node
import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const exec = promisify(execFile)

const __dirname = dirname(fileURLToPath(import.meta.url))

// Resolve the main checkout through git rather than this file's location, so the sweep
// behaves the same when it is invoked from inside one of the worktrees it manages.
const commonDir = await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: __dirname })
	.then((r) => r.stdout.trim())
	.catch(() => "")
const repoRoot = commonDir ? dirname(commonDir) : resolve(__dirname, "..")
const worktreesDir = resolve(repoRoot, ".worktrees")

const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run") || args.includes("-n")
const graceIndex = args.indexOf("--grace-hours")
const graceHours = graceIndex === -1 ? 24 : Number(args[graceIndex + 1])
if (!Number.isFinite(graceHours) || graceHours < 0) {
	console.error("usage: sweep-worktrees.mjs [--dry-run] [--grace-hours <hours>]")
	process.exit(1)
}

const git = async (gitArgs, cwd = repoRoot) => (await exec("git", gitArgs, { cwd, maxBuffer: 32 * 1024 * 1024 })).stdout

const lastLine = (error) =>
	String(error.stderr || error.message)
		.trim()
		.split("\n")
		.pop()

const done = (line) => {
	console.log(line)
	process.exit(0)
}

if (!existsSync(worktreesDir)) done("Sweep: no .worktrees/ directory, nothing to sweep.")

// `.worktrees/` is the entire scope. A worktree under it was created by the workflow skill
// and belongs to it; a branch with no worktree is somebody's, made by hand or on another
// machine. Enumerate the directory and work outward to the branch it holds. Never
// enumerate branches or PRs and work inward.
const entries = []
for (const block of (await git(["worktree", "list", "--porcelain"])).trim().split("\n\n")) {
	const path = block.match(/^worktree (.+)$/m)?.[1]
	const branch = block.match(/^branch refs\/heads\/(.+)$/m)?.[1]
	if (!path?.startsWith(worktreesDir + sep)) continue
	entries.push({ path, branch, name: path.slice(worktreesDir.length + 1) })
}

if (entries.length === 0) done("Sweep: no worktrees under .worktrees/.")

// Everything below is bulk: one `gh` call, one `ls-remote`, one `for-each-ref`, and the
// per-worktree status checks in parallel. Deleting per branch is what made this slow.
const [prJson, remoteRefs, trackRefs] = await Promise.all([
	exec("gh", ["pr", "list", "--state", "all", "--limit", "300", "--json", "number,state,mergedAt,headRefOid,headRefName"], {
		cwd: repoRoot,
		maxBuffer: 32 * 1024 * 1024,
	})
		.then((r) => r.stdout)
		.catch((error) => {
			console.error(`Sweep skipped: \`gh pr list\` failed. ${lastLine(error)}`)
			process.exit(0)
		}),
	git(["ls-remote", "--heads", "origin"]),
	git(["for-each-ref", "refs/heads", "--format=%(refname:short)%09%(upstream:track)"]),
])

const prsByHead = new Map()
for (const pr of JSON.parse(prJson)) {
	if (!prsByHead.has(pr.headRefName)) prsByHead.set(pr.headRefName, [])
	prsByHead.get(pr.headRefName).push(pr)
}

const remoteTips = new Map(
	remoteRefs
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const [oid, ref] = line.split("\t")
			return [ref.replace("refs/heads/", ""), oid]
		}),
)

const aheadBranches = new Set(
	trackRefs
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => line.split("\t"))
		.filter(([, track]) => track?.includes("ahead"))
		.map(([branch]) => branch),
)

const dirty = new Map(
	await Promise.all(
		entries.map(async (entry) => [entry.path, (await git(["status", "--porcelain"], entry.path).catch(() => "?")).trim() !== ""]),
	),
)

const graceMs = graceHours * 60 * 60 * 1000
const cwd = process.cwd()

// Any one of these means leave the entry alone: worktree, local branch, and remote branch.
// Age on its own is never the signal. What makes work disposable is its own PR being
// merged, and the grace period after that merge.
const reasonToKeep = (entry) => {
	if (!entry.branch) return "detached HEAD"
	if (cwd === entry.path || cwd.startsWith(entry.path + sep)) return "this session is inside it"
	if (dirty.get(entry.path)) return "uncommitted changes"

	const prs = prsByHead.get(entry.branch) ?? []
	const open = prs.find((pr) => pr.state === "OPEN")
	if (open) return `open PR #${open.number}`

	const merged = prs.filter((pr) => pr.mergedAt).sort((a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt))[0]
	if (!merged) return "no merged PR"

	const ageMs = Date.now() - Date.parse(merged.mergedAt)
	if (ageMs < graceMs) return `PR #${merged.number} merged ${Math.floor(ageMs / 3600000)}h ago, inside the ${graceHours}h grace period`

	// Ask about unpushed commits while the remote is still there, since deleting it turns
	// the answer into `[gone]`.
	if (aheadBranches.has(entry.branch)) return "unpushed commits"

	const tip = remoteTips.get(entry.branch)
	if (tip && tip !== merged.headRefOid) return `origin tip ${tip.slice(0, 7)} was pushed after PR #${merged.number} merged`

	entry.pr = merged.number
	entry.hasRemote = Boolean(tip)
	return null
}

const sweep = []
const kept = []
for (const entry of entries) {
	const reason = reasonToKeep(entry)
	if (reason) kept.push({ ...entry, reason })
	else sweep.push(entry)
}

const report = () => {
	if (kept.length > 0) console.log(`Kept ${kept.length}: ${kept.map((e) => `${e.name} (${e.reason})`).join(", ")}`)
}

if (sweep.length === 0) {
	console.log(`Sweep: nothing finished, all ${entries.length} worktrees still active.`)
	report()
	process.exit(0)
}

if (dryRun) {
	console.log(`Would sweep ${sweep.length}: ${sweep.map((e) => `${e.name} (PR #${e.pr})`).join(", ")}`)
	report()
	process.exit(0)
}

const failed = []
const removed = []

// Deleting a worktree means deleting its `node_modules`, which is the slowest part of the
// sweep by far. Each removal touches its own directory and its own administrative file
// under `.git/worktrees/`, so they run together rather than one after another.
await Promise.all(
	sweep.map(async (entry) => {
		try {
			await git(["worktree", "remove", entry.path])
			removed.push(entry)
		} catch (error) {
			failed.push(`${entry.name} (${lastLine(error)})`)
		}
	}),
)

// `-D`, not `-d`. The repo squash-merges, so a merged branch is never an ancestor of main
// and `-d` refuses every one of them. The checks above are what make this safe.
if (removed.length > 0) await git(["branch", "-D", ...removed.map((e) => e.branch)])

// One push deletes every remote branch, which is the whole speed win over a push per branch.
const remotes = removed.filter((e) => e.hasRemote).map((e) => e.branch)
if (remotes.length > 0) {
	try {
		await git(["push", "origin", "--delete", ...remotes])
	} catch (error) {
		failed.push(`origin delete (${lastLine(error)})`)
	}
}

await git(["worktree", "prune"])

console.log(`Swept ${removed.length}: ${removed.map((e) => `${e.name} (PR #${e.pr})`).join(", ")}`)
report()
if (failed.length > 0) {
	console.error(`Failed ${failed.length}: ${failed.join(", ")}`)
	process.exit(1)
}
