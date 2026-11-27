import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import * as p from "@clack/prompts"
import type { ArgsDef, CommandContext } from "citty"
import { detect } from "package-manager-detector/detect"
import { log } from "./daemon/logger"
import { PortInUseError, resolveHostPort } from "./wp/ports"

export type PackageManager = "pnpm" | "yarn" | "bun" | "npm"

/**
 * Resolve a host port for a stack, exiting with a clear message when an *explicitly*
 * configured port (`fixed`) is already taken. A default port auto-steps to the next free
 * one (another project's stack or a stray server just shifts us over); an explicit
 * `configKey` collision is the user's own to resolve, so we stop rather than silently
 * serving on a port they didn't choose.
 */
export async function pickStackPort(
	preferred: number,
	{ fixed, host, configKey }: { fixed: boolean; host?: string; configKey: string },
): Promise<number> {
	try {
		return await resolveHostPort(preferred, { fixed, host })
	} catch (error) {
		if (!(error instanceof PortInUseError)) throw error
		log.error(
			`${configKey} ${preferred} is set in kizlo.config but is already in use.\n` +
				`Free that port or change ${configKey} — an explicitly set port is never auto-reassigned.`,
		)
		process.exit(1)
	}
}

/**
 * Loads the project's `.env` files into `process.env`. The single place env
 * values come from — shared by `init --yes` and the `kizlo dev`/`generate`
 * daemon so they always read the same source.
 */
export function loadEnvFiles(cwd: string): void {
	for (const name of [".env", ".env.local"]) {
		const file = path.join(cwd, name)
		if (fs.existsSync(file)) process.loadEnvFile(file)
	}
}

export function getVersion(): string {
	const here = path.dirname(fileURLToPath(import.meta.url))
	const pkgPath = path.resolve(here, "../../package.json")
	const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { version: string }
	return pkg.version
}

/**
 * The package manager a project uses, from evidence in the project or an enclosing workspace — a lockfile
 * (the strongest signal, it reflects an actual install), else package.json's corepack `packageManager` /
 * `devEngines.packageManager` field (declared intent, present before the first install). Delegates to
 * `package-manager-detector`, which recognises every lockfile variant (npm's `package-lock.json` and
 * `npm-shrinkwrap.json` included) and walks up from `cwd` to the filesystem root — so a package in a
 * monorepo resolves to the manager pinned by the workspace root, where the single lockfile lives. Returns
 * `undefined` when no signal is found anywhere up the tree, or the manager isn't one Kizlo supports, rather
 * than guessing: the invoking manager is unreliable (`npx` reports `npm` whatever the user really uses).
 * Callers that can't proceed without one should ask the user (see `selectPackageManager`) instead of
 * defaulting.
 */
export async function detectPackageManager(cwd: string): Promise<PackageManager | undefined> {
	const name = (await detect({ cwd }))?.name
	return name === "pnpm" || name === "yarn" || name === "bun" || name === "npm" ? name : undefined
}

export function envKeysPresent(contents: string, keys: readonly string[]): string[] {
	return keys.filter((key) => new RegExp(`^\\s*${key}\\s*=`, "m").test(contents))
}

/** Like {@link envKeysPresent}, but also matches commented-out placeholders (`# KEY=`). */
export function envKeysDeclared(contents: string, keys: readonly string[]): string[] {
	return keys.filter((key) => new RegExp(`^\\s*#?\\s*${key}\\s*=`, "m").test(contents))
}

export interface EnvMergeResult {
	content: string
	added: string[]
	updated: string[]
	kept: string[]
}

/** A `.env` section: a comment header written above its keys when any of them are newly appended. */
export interface EnvGroup {
	/** Header text (without the leading `# `). */
	comment: string
	/** Keys that belong under this header, in write order. */
	keys: readonly string[]
}

/** Connection values managed by local development. Browser URLs remain app configuration. */
export const DEV_ENV_GROUPS: EnvGroup[] = [
	{ comment: "Kizlo Mode (local | remote)", keys: ["KIZLO_MODE"] },
	{ comment: "Kizlo Remote", keys: ["KIZLO_WP_SECRET", "KIZLO_WP_URL", "KIZLO_WP_USERNAME", "KIZLO_WP_APP_PASSWORD"] },
	{
		comment: "Kizlo Local",
		keys: ["KIZLO_LOCAL_WP_SECRET", "KIZLO_LOCAL_WP_URL", "KIZLO_LOCAL_WP_USERNAME", "KIZLO_LOCAL_WP_APP_PASSWORD"],
	},
]

/**
 * Merges `values` into an existing .env body: other variables, comments and
 * blank lines are preserved. A managed key is rewritten only when listed in
 * `overwriteKeys`; otherwise its existing line is kept. Missing keys are appended —
 * grouped under their `groups` comment header (with a blank-line separator) when one
 * is given, or as bare lines otherwise.
 */
export function mergeEnv(
	existing: string,
	values: Record<string, string>,
	overwriteKeys: ReadonlySet<string>,
	groups?: readonly EnvGroup[],
): EnvMergeResult {
	const body = existing.replace(/\s*$/, "")
	const lines = body.length ? body.split(/\r?\n/) : []
	const added: string[] = []
	const updated: string[] = []
	const kept: string[] = []
	const present = new Set<string>()

	const next = lines.map((line) => {
		const key = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1]
		if (key && key in values) {
			present.add(key)
			if (overwriteKeys.has(key)) {
				updated.push(key)
				return `${key}=${values[key]}`
			}
			kept.push(key)
		}
		return line
	})

	const remaining = new Map(Object.entries(values).filter(([key]) => !present.has(key)))
	const append = (key: string) => {
		added.push(key)
		next.push(`${key}=${remaining.get(key)}`)
		remaining.delete(key)
	}

	for (const group of groups ?? []) {
		const groupKeys = group.keys.filter((key) => remaining.has(key))
		if (!groupKeys.length) continue
		if (next.length) next.push("")
		next.push(`# ${group.comment}`)
		for (const key of groupKeys) append(key)
	}

	for (const key of remaining.keys()) append(key)

	return { content: `${next.join("\n")}\n`, added, updated, kept }
}

export function ensureGitignored(cwd: string, entry: string): "created" | "added" | "present" {
	const gitignorePath = path.join(cwd, ".gitignore")
	const existed = fs.existsSync(gitignorePath)
	const contents = existed ? fs.readFileSync(gitignorePath, "utf8") : ""

	if (contents.split(/\r?\n/).some((line) => line.trim() === entry)) return "present"

	const prefix = contents.length && !contents.endsWith("\n") ? `${contents}\n` : contents
	fs.writeFileSync(gitignorePath, `${prefix}${entry}\n`)
	return existed ? "added" : "created"
}

/**
 * Run a slow async step behind a clack spinner. Shows `message` while `fn` runs,
 * stops with `done` (or `message`) on success, and stops with an error mark then
 * rethrows on failure so callers keep their existing try/finally control flow.
 */
export async function withSpinner<T>(message: string, fn: () => Promise<T>, done?: string): Promise<T> {
	const s = p.spinner()
	s.start(message)
	try {
		const result = await fn()
		s.stop(done ?? message)
		return result
	} catch (error) {
		s.error(`${message} failed`)
		throw error
	}
}

/**
 * Wrap a command group's default `run` so it fires only for the bare invocation
 * (`kizlo test`), not when a subcommand was given (`kizlo test up`). citty runs a
 * group's own `run` *in addition to* the matched subcommand, so without this guard
 * the default would double-fire on every subcommand. Pass the group's subcommand
 * names; the first non-flag arg is matched the same way citty picks the subcommand.
 */
export function groupDefault<T extends ArgsDef>(
	subCommandNames: Iterable<string>,
	run: (ctx: CommandContext<T>) => unknown,
): (ctx: CommandContext<T>) => Promise<void> {
	const names = new Set(subCommandNames)
	return async (ctx) => {
		const sub = ctx.rawArgs.find((arg) => !arg.startsWith("-"))
		if (sub !== undefined && names.has(sub)) return
		await run(ctx)
	}
}
