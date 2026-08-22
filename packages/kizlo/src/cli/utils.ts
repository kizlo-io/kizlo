import { spawn, spawnSync } from "node:child_process"
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

export function stripJsonComments(source: string): string {
	return source.replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (match, comment) => (comment ? "" : match))
}

export function readTsconfigPaths(cwd: string): Record<string, string[]> | undefined {
	const file = path.join(cwd, "tsconfig.json")
	if (!fs.existsSync(file)) return undefined
	const raw = fs.readFileSync(file, "utf8")
	let json: { compilerOptions?: { paths?: Record<string, string[]> } }
	try {
		json = JSON.parse(raw)
	} catch {
		try {
			json = JSON.parse(stripJsonComments(raw))
		} catch {
			return undefined
		}
	}
	return json.compilerOptions?.paths
}

/**
 * The kizlo.config file names, in resolution order. Mirrors `CONFIG_FILES` in daemon/config — kept here
 * to avoid an import cycle, since daemon/config already depends on this module.
 */
const KIZLO_CONFIG_FILES = ["kizlo.config.ts", "kizlo.config.js", "kizlo.config.mjs"]

/**
 * The import alias a previous `kizlo init` recorded in kizlo.config — the persisted preference a re-run
 * reuses so it never asks again. Returns the prefix (`""` for the deliberate relative-imports choice),
 * or `undefined` when there's no config or it declares no `alias` at all (the choice was never made, so
 * the caller must prompt or default). A light text scan of the generated file, so setup never has to
 * import the TS config — or resolve `kizlo` — just to read one field back.
 */
export function readPersistedAlias(cwd: string): string | undefined {
	for (const name of KIZLO_CONFIG_FILES) {
		const file = path.join(cwd, name)
		if (!fs.existsSync(file)) continue
		const match = fs.readFileSync(file, "utf8").match(/\balias\s*:\s*["']([^"']*)["']/)
		return match ? match[1] : undefined
	}
	return undefined
}

function relativeImport(targetRel: string, fromDirRel: string): string {
	const rel = path.relative(fromDirRel, targetRel).split(path.sep).join("/")
	return rel.startsWith(".") ? rel : `./${rel}`
}

/**
 * Detects an import alias from tsconfig `paths` that covers `targetRel`, returning
 * `{ prefix, importPath }`. The prefix is what `init` persists to kizlo.config;
 * the import path is the full specifier. Returns undefined when no alias matches.
 * `preferred` (with or without its trailing slash) names the prefix the caller would
 * rather have and wins over an earlier-declared one — a project mapping both `#/*` and
 * `@/*` onto the same root would otherwise silently switch to whichever it declares first.
 */
export function detectImportAlias(cwd: string, targetRel: string, preferred?: string): { prefix: string; importPath: string } | undefined {
	const target = targetRel.split(path.sep).join("/").replace(/\/+$/, "")
	const want = preferred?.replace(/\/+$/, "")
	let fallback: { prefix: string; importPath: string } | undefined

	for (const [alias, mappings] of Object.entries(readTsconfigPaths(cwd) ?? {})) {
		if (!alias.endsWith("/*")) continue
		const prefix = alias.slice(0, -2)
		for (const mapping of mappings ?? []) {
			if (!mapping.endsWith("/*")) continue
			const base = mapping.slice(0, -2).replace(/^\.\//, "").replace(/^\.$/, "").replace(/\/+$/, "")
			const baseSlash = base ? `${base}/` : ""
			if (target !== base && !target.startsWith(baseSlash)) continue
			const match = { prefix, importPath: `${prefix}/${target.slice(baseSlash.length)}` }
			if (prefix === want) return match
			fallback ??= match
		}
	}
	return fallback
}

/**
 * Normalize an alias prefix to the canonical `@/` form — the way an import alias is actually written and
 * declared in tsconfig `paths` (`@/*`), so the persisted preference reads like the imports it produces.
 * A trailing slash is enforced (`@` → `@/`); empty stays empty, the recorded "relative imports" choice.
 */
export function aliasWithSlash(alias: string | undefined): string {
	return alias ? `${alias.replace(/\/+$/, "")}/` : ""
}

/**
 * Builds an import specifier for `targetRel` from `fromDirRel`. An empty `alias` forces a relative
 * import; any other value is a preference, checked against tsconfig `paths` rather than asserted.
 * An alias the project never declares falls back to relative, which always resolves — writing
 * `@/lib/kizlo/server` into a project with no `@` mapping breaks its typecheck and its build.
 */
export function resolveModuleImport(cwd: string, targetRel: string, fromDirRel: string, alias?: string): string {
	if (alias === "") return relativeImport(targetRel, fromDirRel)
	return detectImportAlias(cwd, targetRel, alias)?.importPath ?? relativeImport(targetRel, fromDirRel)
}

/**
 * The alias imports will really be written through, once the requested one is checked against the
 * project's tsconfig — `""` when nothing declared there covers `targetRel`. The single answer
 * `create` and `init` persist to kizlo.config, show in their summary and warn from, so all three
 * agree with what {@link resolveModuleImport} goes on to emit.
 */
export function effectiveAlias(cwd: string, targetRel: string, requested: string | undefined): string {
	if (requested === "") return ""
	return detectImportAlias(cwd, targetRel, requested)?.prefix ?? ""
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

/** The installed version of `pm`, from `pm --version` (e.g. `"9.0.0"`). Undefined when it can't be run. */
function packageManagerVersion(pm: PackageManager): string | undefined {
	const result = spawnSync(pm, ["--version"], {
		encoding: "utf8",
		shell: process.platform === "win32",
	})
	if (result.error || result.status !== 0) return undefined
	const version = result.stdout.trim()
	return version.length > 0 ? version : undefined
}

/**
 * Record `pm` as package.json's corepack `packageManager` field so a later `detectPackageManager` settles on
 * it instead of asking again — the fix for a project that gave no signal and had to be prompted for. Stamps
 * the installed version (`pm --version`) to keep the field corepack-valid, dropping it only when the version
 * can't be read. Leaves an existing field untouched, preserves the file's indentation, and swallows any
 * read/write failure: persisting the choice is a convenience, not worth failing the command over.
 */
export function persistPackageManagerField(cwd: string, pm: PackageManager): void {
	const pkgPath = path.join(cwd, "package.json")
	try {
		const raw = fs.readFileSync(pkgPath, "utf8")
		const pkg = JSON.parse(raw) as { packageManager?: string }
		if (pkg.packageManager) return
		const version = packageManagerVersion(pm)
		pkg.packageManager = version ? `${pm}@${version}` : pm
		const indent = raw.match(/\n([ \t]+)/)?.[1] ?? "\t"
		fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, indent)}\n`)
	} catch {
		// Best-effort: a project we can't read or write just gets asked again next time.
	}
}

/**
 * The package manager that invoked the current process, read from `npm_config_user_agent`
 * (e.g. `pnpm/9.0.0 npm/? node/v20`). Used to pre-select the most likely choice when a fresh
 * project has no lockfile to detect from. Returns undefined when the agent is absent or unknown.
 */
export function detectInvokingPackageManager(): PackageManager | undefined {
	const name = process.env.npm_config_user_agent?.split("/")[0]
	return name === "pnpm" || name === "yarn" || name === "bun" || name === "npm" ? name : undefined
}

/** An enclosing workspace found above a target directory. */
export interface WorkspaceInfo {
	/** The workspace root — the dir a member install runs from, where the single lockfile lives. */
	root: string
	/** Which config declares the workspace: pnpm's `pnpm-workspace.yaml`, or a `package.json` `workspaces` field (npm/yarn/bun). */
	kind: "pnpm" | "npm"
}

/**
 * Walk up from `fromDir` for the nearest enclosing workspace root: a directory holding a
 * `pnpm-workspace.yaml` (pnpm), or a `package.json` with a non-empty `workspaces` field (npm/yarn/bun).
 * Returns the root and which config declares it, or `undefined` when the target is standalone (no
 * monorepo above it). Only those two markers count — a plain parent `package.json` without `workspaces`
 * does not make a workspace. Start this from the app's *parent*: a scaffolded app may carry its own
 * (framework-created) workspace file, and we only care about an *enclosing* one.
 */
export function findWorkspaceRoot(fromDir: string): WorkspaceInfo | undefined {
	let dir = path.resolve(fromDir)
	while (true) {
		if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return { root: dir, kind: "pnpm" }
		if (workspaceGlobs(dir).length > 0) return { root: dir, kind: "npm" }
		const parent = path.dirname(dir)
		if (parent === dir) return undefined // reached the filesystem root
		dir = parent
	}
}

/** The `workspaces` globs declared in `dir`'s `package.json` (array, or the `{ packages: [] }` form); empty when absent or unreadable. */
function workspaceGlobs(dir: string): string[] {
	const pkgPath = path.join(dir, "package.json")
	if (!fs.existsSync(pkgPath)) return []
	try {
		const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { workspaces?: string[] | { packages?: string[] } }
		return (Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces?.packages) ?? []
	} catch {
		return []
	}
}

/**
 * Match a workspace-relative POSIX path against a set of `workspaces`-style globs: `*` matches a single
 * path segment, `**` any depth, and a leading `!` excludes (later patterns win, so an exclude can undo an
 * earlier match). Deliberately small — workspace globs are simple directory patterns, not full gitignore
 * semantics — and only used as the npm/yarn/bun membership fallback (pnpm membership asks pnpm directly).
 */
export function matchesWorkspaceGlobs(relPath: string, globs: readonly string[]): boolean {
	let matched = false
	for (const raw of globs) {
		const negated = raw.startsWith("!")
		if (globToRegExp(negated ? raw.slice(1) : raw).test(relPath)) matched = !negated
	}
	return matched
}

function globToRegExp(glob: string): RegExp {
	const pattern = glob.replace(/\/+$/, "")
	let re = ""
	for (let i = 0; i < pattern.length; i++) {
		const char = pattern[i]
		if (char === "*") {
			if (pattern[i + 1] === "*") {
				re += ".*"
				i++
				if (pattern[i + 1] === "/") i++ // swallow the slash after `**` so `a/**` matches `a` too
			} else {
				re += "[^/]+"
			}
		} else if ("\\^$.|?+()[]{}".includes(char as string)) {
			re += `\\${char}`
		} else {
			re += char
		}
	}
	return new RegExp(`^${re}$`)
}

/**
 * Whether `appDir` is a member of `workspace` — i.e. whether an install run from the workspace root would
 * install it. For pnpm this asks pnpm itself (`pnpm -r ls`), matching pnpm's own resolution exactly rather
 * than reimplementing its glob rules; for npm/yarn/bun (which offer no equivalent pre-install enumeration)
 * it glob-matches the app's path against the root's `workspaces` globs. The app must already exist on disk
 * for either check to see it. A failed or unparseable pnpm probe reads as "not a member" — the safe
 * default, since it falls back to a standalone install rather than a root install that might do nothing.
 */
export function isWorkspaceMember(workspace: WorkspaceInfo, appDir: string): boolean {
	const target = path.resolve(appDir)
	if (workspace.kind === "pnpm") {
		const result = spawnSync("pnpm", ["-r", "ls", "--depth", "-1", "--json"], {
			cwd: workspace.root,
			encoding: "utf8",
			shell: process.platform === "win32",
		})
		if (result.error || result.status !== 0 || !result.stdout) return false
		try {
			const projects = JSON.parse(result.stdout) as { path: string }[]
			return projects.some((project) => path.resolve(project.path) === target)
		} catch {
			return false
		}
	}
	const rel = path.relative(workspace.root, target).split(path.sep).join("/")
	return matchesWorkspaceGlobs(rel, workspaceGlobs(workspace.root))
}

/**
 * The app-local package-manager files a framework's `create` CLI may leave behind that detach a scaffolded
 * app from an enclosing monorepo: a nested `pnpm-workspace.yaml` makes the app its own workspace root, and
 * a stray lockfile shadows the monorepo's single one. Removed only when the app is a workspace *member*, so
 * an install from the root treats it as one (fixing `workspace:` resolution); a standalone app keeps its
 * files, where they're correct. Returns the names removed.
 */
export function cleanupWorkspaceArtifacts(dir: string): string[] {
	const artifacts = ["pnpm-workspace.yaml", "pnpm-lock.yaml", "package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "bun.lockb"]
	const removed: string[] = []
	for (const name of artifacts) {
		const file = path.join(dir, name)
		if (fs.existsSync(file)) {
			fs.rmSync(file)
			removed.push(name)
		}
	}
	return removed
}

/**
 * Whether `command` resolves to a runnable executable, probed with `--version`. Used to hide or
 * disable package-manager choices the user can't actually run. A non-zero exit or a spawn error
 * (the binary isn't on PATH) both count as unavailable.
 */
export function isCommandAvailable(command: string): boolean {
	const result = spawnSync(command, ["--version"], {
		stdio: "ignore",
		shell: process.platform === "win32",
	})
	return !result.error && result.status === 0
}

/** The package managers currently installed on the host, in the given display order. */
export function availablePackageManagers(order: readonly PackageManager[]): PackageManager[] {
	return order.filter((pm) => isCommandAvailable(pm))
}

/**
 * The argv to add a single package with `pm`, e.g. `pnpm add kizlo`. `dev: true` installs it as a
 * dev dependency — npm spells that `--save-dev`, every other supported manager `--dev`.
 */
export function addDependencyArgs(pm: PackageManager, pkg: string, opts: { dev?: boolean } = {}): string[] {
	const base = pm === "npm" ? ["npm", "install", pkg] : [pm, "add", pkg]
	if (!opts.dev) return base
	return [...base, pm === "npm" ? "--save-dev" : "--dev"]
}

/** The argv to install a project's dependencies with `pm` — every supported manager spells it `<pm> install`. */
export function installArgs(pm: PackageManager): string[] {
	return [pm, "install"]
}

/**
 * pnpm (v10+) and bun refuse to run dependencies' build/lifecycle scripts on install by default, leaving
 * those packages unbuilt — pnpm prints an `Ignored build scripts:` warning, bun a `Blocked N postinstall`
 * one. The install still exits 0, so nothing else flags it. Scan an install's captured output for that
 * warning and, when present, return the command that runs the blocked scripts (`pnpm approve-builds` /
 * `bun pm trust --all`) so the caller can surface it as a follow-up step. Undefined when the output shows
 * none, or the manager runs scripts on install anyway (npm, yarn) so there's nothing to approve.
 */
export function approveBuildsCommand(pm: PackageManager, output: string): string | undefined {
	if (pm === "pnpm" && /ignored build scripts/i.test(output)) return "pnpm approve-builds"
	if (pm === "bun" && /blocked \d+ postinstall/i.test(output)) return "bun pm trust --all"
	return undefined
}

/**
 * Split a command string into an argv array the way a shell would for the simple cases a bootstrap
 * command needs: runs of whitespace separate tokens, and a single- or double-quoted span groups a token
 * that contains spaces (the surrounding quotes are stripped). There is no variable, glob, or escape
 * expansion — a bootstrap command is a plain `<pm> create … {{name}}` template, so this stays a small
 * tokenizer rather than a full shell parser. Empty and whitespace-only strings yield an empty argv.
 */
export function tokenizeCommand(command: string): string[] {
	const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g
	return Array.from(command.matchAll(pattern), (match) => match[1] ?? match[2] ?? match[3] ?? "")
}

export function runCommand(args: string[], cwd: string, stdio: "inherit" | "ignore" = "inherit"): boolean {
	const [command, ...rest] = args
	if (!command) return false
	const result = spawnSync(command, rest, {
		cwd,
		stdio,
		shell: process.platform === "win32",
	})
	return result.status === 0
}

/**
 * Async sibling of {@link runCommand}: runs a command without blocking the event loop, so a clack
 * spinner can keep animating while it works (a synchronous `spawnSync` would freeze it on the first
 * frame). Resolves whether it exited cleanly; a spawn error (binary off PATH) resolves false.
 */
export function runCommandAsync(args: string[], cwd: string, stdio: "inherit" | "ignore" = "inherit"): Promise<boolean> {
	const [command, ...rest] = args
	if (!command) return Promise.resolve(false)
	return new Promise((resolve) => {
		const child = spawn(command, rest, { cwd, stdio, shell: process.platform === "win32" })
		child.on("error", () => resolve(false))
		child.on("close", (code) => resolve(code === 0))
	})
}

/**
 * Run a command capturing its combined output instead of streaming it, for a step that should stay quiet
 * on success but whose logs are worth surfacing when it fails (e.g. the framework's scaffolder behind a
 * spinner). Runs without blocking the event loop, so a clack spinner keeps animating while it works — a
 * synchronous `spawnSync` would freeze the spinner on its first frame and look stuck. Resolves whether it
 * exited cleanly plus the trimmed stdout+stderr; a spawn error (binary off PATH) resolves
 * `{ ok: false, output: "" }`.
 */
export function runCommandCapturedAsync(args: string[], cwd: string): Promise<{ ok: boolean; output: string }> {
	const [command, ...rest] = args
	if (!command) return Promise.resolve({ ok: false, output: "" })
	return new Promise((resolve) => {
		const child = spawn(command, rest, { cwd, shell: process.platform === "win32" })
		let output = ""
		child.stdout?.on("data", (chunk) => {
			output += chunk
		})
		child.stderr?.on("data", (chunk) => {
			output += chunk
		})
		child.on("error", () => resolve({ ok: false, output: "" }))
		child.on("close", (code) => resolve({ ok: code === 0, output: output.trim() }))
	})
}

export function writeFileIfAbsent(filePath: string, contents: string): boolean {
	if (fs.existsSync(filePath)) return false
	fs.mkdirSync(path.dirname(filePath), { recursive: true })
	fs.writeFileSync(filePath, contents)
	return true
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

/**
 * The `.env` key names the scaffold writes and the pinned runtime later reads — the wiring contract's
 * one drift-prone surface, so the names are declared as data (the template's `env` section) rather than
 * hardcoded here. This is the resolved shape both sides agree on: the public API URL key, plus the
 * remote and local WordPress credential sets. Semantic slots, not values — the CLI still fills each
 * from the connection.
 */
export interface EnvKeys {
	/** Public Kizlo API URL key, e.g. `KIZLO_API_URL` or a framework-prefixed `NEXT_PUBLIC_KIZLO_API_URL`. */
	baseUrl: string
	/** Keys a real remote deploy reads. */
	remote: { siteSecret: string; wpUrl: string; wpUsername: string; wpPassword: string }
	/** Keys local WordPress (`kizlo dev`) manages, plus the `local | remote` connect switch. */
	local: { connect: string; siteSecret: string; wpUrl: string; wpUsername: string; wpPassword: string }
}

/**
 * The built-in key names, used by the generic `base` preset (no template, no separately-pinned
 * runtime) and as the fallback when a template's manifest declares no `env` section (in-repo before the
 * first stamped release). Real templates carry their own `env`, so this is the standard `KIZLO_*` set.
 */
export const DEFAULT_ENV_KEYS: EnvKeys = {
	baseUrl: "KIZLO_API_URL",
	remote: {
		siteSecret: "KIZLO_WP_SECRET",
		wpUrl: "KIZLO_WP_URL",
		wpUsername: "KIZLO_WP_USERNAME",
		wpPassword: "KIZLO_WP_APP_PASSWORD",
	},
	local: {
		connect: "KIZLO_CONNECT",
		siteSecret: "KIZLO_LOCAL_WP_SECRET",
		wpUrl: "KIZLO_LOCAL_WP_URL",
		wpUsername: "KIZLO_LOCAL_WP_USERNAME",
		wpPassword: "KIZLO_LOCAL_WP_APP_PASSWORD",
	},
}

/**
 * The grouped `.env` layout shared by `init` and `dev`, so both write the same sectioned file:
 * a connect switch, the API URL, then the remote and local connection blocks. The key names come from
 * the resolved {@link EnvKeys} (the template's `env` contract), so the sections stay labelled correctly
 * whatever a template calls them. Only sections whose keys are actually being appended get a header, so
 * a remote run skips the local block and vice versa.
 */
export function envGroups(envKeys: EnvKeys): EnvGroup[] {
	return [
		{ comment: "Kizlo Connect (local | remote)", keys: [envKeys.local.connect] },
		{ comment: "Kizlo API URL", keys: [envKeys.baseUrl] },
		{
			comment: "Kizlo Remote",
			keys: [envKeys.remote.siteSecret, envKeys.remote.wpUrl, envKeys.remote.wpUsername, envKeys.remote.wpPassword],
		},
		{
			comment: "Kizlo Local",
			keys: [envKeys.local.siteSecret, envKeys.local.wpUrl, envKeys.local.wpUsername, envKeys.local.wpPassword],
		},
	]
}

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

/**
 * Whether `dir` already sits inside a git work tree — true when the framework CLI ran `git init`, or
 * when scaffolding into a subfolder of an existing repo (e.g. a monorepo). Used to skip offering
 * `git init` where a repo is already present rather than nesting one. A missing `git` binary (spawn
 * error) reads as "not a repo".
 */
export function isGitRepository(dir: string): boolean {
	const result = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
		cwd: dir,
		stdio: "ignore",
		shell: process.platform === "win32",
	})
	return !result.error && result.status === 0
}

/**
 * Initialize a git repository in `dir` with an initial commit. Best-effort: returns whether the repo
 * was created (`git init` succeeded). The commit is attempted but not required — it needs a configured
 * `user.name`/`user.email` a bare machine may lack, and a repo with staged-but-uncommitted files is
 * still a usable starting point. Returns false when `git` isn't installed.
 */
export function initGitRepository(dir: string): boolean {
	if (!isCommandAvailable("git")) return false
	if (!runCommand(["git", "init"], dir, "ignore")) return false
	runCommand(["git", "add", "-A"], dir, "ignore")
	runCommand(["git", "commit", "-m", "Initial commit"], dir, "ignore")
	return true
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
