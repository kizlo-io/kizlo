import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import * as p from "@clack/prompts"
import type { ArgsDef, CommandContext } from "citty"

export type PackageManager = "pnpm" | "yarn" | "bun" | "npm"

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

function relativeImport(targetRel: string, fromDirRel: string): string {
	const rel = path.relative(fromDirRel, targetRel).split(path.sep).join("/")
	return rel.startsWith(".") ? rel : `./${rel}`
}

/**
 * Detects an import alias from tsconfig `paths` that covers `targetRel`, returning
 * `{ prefix, importPath }`. The prefix is what `init` persists to kizlo.config;
 * the import path is the full specifier. Returns undefined when no alias matches.
 */
export function detectImportAlias(cwd: string, targetRel: string): { prefix: string; importPath: string } | undefined {
	const target = targetRel.split(path.sep).join("/").replace(/\/+$/, "")

	for (const [alias, mappings] of Object.entries(readTsconfigPaths(cwd) ?? {})) {
		if (!alias.endsWith("/*")) continue
		const prefix = alias.slice(0, -2)
		for (const mapping of mappings ?? []) {
			if (!mapping.endsWith("/*")) continue
			const base = mapping.slice(0, -2).replace(/^\.\//, "").replace(/^\.$/, "").replace(/\/+$/, "")
			const baseSlash = base ? `${base}/` : ""
			if (target === base || target.startsWith(baseSlash)) return { prefix, importPath: `${prefix}/${target.slice(baseSlash.length)}` }
		}
	}
	return undefined
}

/**
 * Builds an import specifier for `targetRel` from `fromDirRel`. With an explicit
 * `alias` prefix (from kizlo.config), builds `<alias>/<target>`; an empty alias
 * forces a relative import. Without one, detects from tsconfig, else relative.
 */
export function resolveModuleImport(cwd: string, targetRel: string, fromDirRel: string, alias?: string): string {
	const target = targetRel.split(path.sep).join("/").replace(/\/+$/, "")

	if (alias !== undefined) {
		if (alias === "") return relativeImport(targetRel, fromDirRel)
		const prefix = alias.replace(/\/+$/, "")
		const base = detectImportAlias(cwd, targetRel) // reuse the project's base mapping when the prefix matches
		return base && base.prefix === prefix ? base.importPath : `${prefix}/${target.replace(/^src\//, "")}`
	}

	return detectImportAlias(cwd, targetRel)?.importPath ?? relativeImport(targetRel, fromDirRel)
}

/**
 * Loads the project's `.env` files into `process.env`. The single place env
 * values come from — shared by `init --yes` and the `kizlo watch`/`generate`
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

export function detectPackageManager(cwd: string): PackageManager {
	if (fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) return "pnpm"
	if (fs.existsSync(path.join(cwd, "yarn.lock"))) return "yarn"
	if (fs.existsSync(path.join(cwd, "bun.lockb")) || fs.existsSync(path.join(cwd, "bun.lock"))) return "bun"
	return "npm"
}

export function addDependencyArgs(pm: PackageManager, pkg: string): string[] {
	if (pm === "npm") return ["npm", "install", pkg]
	return [pm, "add", pkg]
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

export function writeFileIfAbsent(filePath: string, contents: string): boolean {
	if (fs.existsSync(filePath)) return false
	fs.mkdirSync(path.dirname(filePath), { recursive: true })
	fs.writeFileSync(filePath, contents)
	return true
}

export function envKeysPresent(contents: string, keys: readonly string[]): string[] {
	return keys.filter((key) => new RegExp(`^\\s*${key}\\s*=`, "m").test(contents))
}

export interface EnvMergeResult {
	content: string
	added: string[]
	updated: string[]
	kept: string[]
}

/**
 * Merges `values` into an existing .env body: other variables, comments and
 * blank lines are preserved. A managed key is rewritten only when listed in
 * `overwriteKeys`; otherwise its existing line is kept. Missing keys are appended.
 */
export function mergeEnv(existing: string, values: Record<string, string>, overwriteKeys: ReadonlySet<string>): EnvMergeResult {
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

	for (const [key, value] of Object.entries(values)) {
		if (!present.has(key)) {
			added.push(key)
			next.push(`${key}=${value}`)
		}
	}

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
