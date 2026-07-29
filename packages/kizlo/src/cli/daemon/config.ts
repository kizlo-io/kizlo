import fs from "node:fs"
import path from "node:path"
import z from "zod/v4"
import type { KizloGlobalConfig } from "../../config"
import { detectPackageManager, type PackageManager } from "../utils"
import { LOCAL_DIR_REL } from "../wp/constants"
import type { Fixture } from "../wp/types"
import { credentialsPath, findConfigDir } from "../wp/utils"
import { importIgnoringVirtualModules } from "./jiti"
import { log } from "./logger"

const fixtureSchema = z.custom<Fixture>(
	(value) => typeof value === "object" && value !== null && typeof (value as { name?: unknown }).name === "string",
	{ message: "must be a fixture object with a string `name` (use defineFixture)" },
)

/** Runtime shape of `kizlo.config.*` — mirrors {@link KizloGlobalConfig}. */
const configSchema = z.object({
	dir: z.string().optional(),
	alias: z.string().optional(),
	name: z.string().optional(),
	dev: z
		.object({
			local: z.boolean().optional(),
			port: z.number().int().positive().optional(),
			dbPort: z.number().int().positive().optional(),
			fixtures: z.array(fixtureSchema).optional(),
		})
		.optional(),
	test: z
		.object({
			local: z.boolean().optional(),
			port: z.number().int().positive().optional(),
			fixtures: z.array(fixtureSchema).optional(),
			packageManager: z.enum(["npm", "pnpm", "yarn", "bun"]).optional(),
			command: z.string().optional(),
		})
		.optional(),
})

/** Parsed config shape — mirrors {@link KizloGlobalConfig}, with every block optional. */
type LoadedConfig = z.infer<typeof configSchema>

export interface ResolvedConfig {
	cwd: string
	/** Kizlo's home directory. */
	dir: string
	serverDir: string
	serverEntry: string
	generatedDir: string
	contractPath: string
	barrelPath: string
}

export const CONFIG_FILES = ["kizlo.config.ts", "kizlo.config.js", "kizlo.config.mjs"]

export const DEFAULT_DEV_PORT = 8080
export const DEFAULT_DEV_DB_PORT = 3307
const DEFAULT_TEST_PORT = 8889

async function loadConfigFile(cwd: string): Promise<LoadedConfig | undefined> {
	const file = CONFIG_FILES.map((name) => path.join(cwd, name)).find((p) => fs.existsSync(p))
	if (!file) return undefined

	let raw: unknown
	try {
		const mod = await importIgnoringVirtualModules<{ default?: KizloGlobalConfig } & KizloGlobalConfig>(cwd, file)
		raw = mod.default ?? mod
	} catch (error) {
		log.error(`Could not load ${path.basename(file)}:`, error)
		process.exit(1)
	}

	const result = configSchema.safeParse(raw)
	if (!result.success) {
		log.error(`Invalid ${path.basename(file)}:\n${z.prettifyError(result.error)}`)
		process.exit(1)
	}
	return result.data
}

/**
 * Resolve the Kizlo server layout from an explicit `dir` — the `--dir` flag or `dir` in
 * `kizlo.config.*`. Returns `undefined` when neither is set: there's no Kizlo server to
 * generate a contract from, so callers skip generation and (for `dev`) run local WordPress
 * alone. There's intentionally no default path — a missing `dir` means "no server", not
 * "look under `lib/kizlo`".
 */
export async function resolveConfig(cwd: string, flags?: { dir?: string }): Promise<ResolvedConfig | undefined> {
	const fileConfig = await loadConfigFile(cwd)
	const raw = flags?.dir ?? fileConfig?.dir
	if (!raw) return undefined
	const dir = raw.replace(/^\.\//, "").replace(/\/+$/, "")
	const serverDir = path.join(dir, "server")
	const generatedDir = path.join(serverDir, "generated")

	return {
		cwd,
		dir,
		serverDir,
		serverEntry: path.join(serverDir, "index.ts"),
		generatedDir,
		contractPath: path.join(generatedDir, "contract.json"),
		barrelPath: path.join(generatedDir, "index.ts"),
	}
}

/**
 * Sanitize an arbitrary package/dir name into a valid Docker compose project id:
 * lowercase, `@scope/pkg` → `scope-pkg`, dropping anything outside `[a-z0-9_-]`.
 */
function sanitizeProjectName(raw: string): string {
	const id = raw
		.toLowerCase()
		.replace(/^@/, "")
		.replace(/\//g, "-")
		.replace(/[^a-z0-9_-]/g, "")
		.replace(/^[-_]+|[-_]+$/g, "")
	return id || "kizlo"
}

/**
 * Base name for the local stacks: the config `name` if set, else the `package.json`
 * `name` at `configDir`, else the config dir basename — sanitized to a Docker id.
 */
export function resolveStackName(configDir: string, configName?: string): string {
	if (configName) return sanitizeProjectName(configName)

	let pkgName: string | undefined
	try {
		const pkg = JSON.parse(fs.readFileSync(path.join(configDir, "package.json"), "utf8")) as { name?: string }
		pkgName = pkg.name
	} catch {
		pkgName = undefined
	}

	return sanitizeProjectName(pkgName ?? path.basename(configDir))
}

/**
 * Compose project id for a stack: `kizlo-<name>-<kind>`. The leading `kizlo-` is what
 * lets every stack this tool starts be filtered together in Docker (e.g.
 * `docker ps --filter name=kizlo-`), independent of each project's own name.
 */
export function stackProject(baseName: string, kind: "dev" | "test"): string {
	return `kizlo-${baseName}-${kind}`
}

export interface ResolvedTestConfig {
	/** Directory holding `kizlo.config.*` (the credentials artifact root). */
	configDir: string
	/** True when `test.local` is set — `kizlo test` boots local WordPress before running the suite. */
	local: boolean
	/** Docker compose project name (`kizlo-<name>-test`). */
	project: string
	/** Resolved credentials artifact path under `configDir`. */
	credentialsPath: string
	port: number
	/** True when `test.port` was set in config — the user owns collisions, so don't auto-step. */
	portExplicit: boolean
	fixtures: Fixture[]
	packageManager: PackageManager
	/** Explicit override; when unset, callers run `<packageManager> test`. */
	command?: string
}

/**
 * Resolve the `test` block from `kizlo.config.*` into concrete values for the
 * `test` command, applying defaults (port 8889, auto-detected package manager)
 * and anchoring the credentials artifact to the config directory.
 */
export async function resolveTestConfig(cwd: string): Promise<ResolvedTestConfig> {
	const configDir = findConfigDir(cwd)
	const fileConfig = await loadConfigFile(configDir)
	const test = fileConfig?.test ?? {}

	return {
		configDir,
		local: Boolean(test.local),
		project: stackProject(resolveStackName(configDir, fileConfig?.name), "test"),
		command: test.command,
		port: test.port ?? DEFAULT_TEST_PORT,
		portExplicit: test.port !== undefined,
		fixtures: test.fixtures ?? [],
		credentialsPath: credentialsPath(cwd),
		packageManager: test.packageManager ?? detectPackageManager(configDir) ?? "npm",
	}
}

export interface ResolvedDevConfig {
	/** Directory holding `kizlo.config.*`. */
	configDir: string
	/** Docker compose project name (`kizlo-<name>-dev`). */
	project: string
	port: number
	/** True when `dev.port` was set in config — the user owns collisions, so don't auto-step. */
	portExplicit: boolean
	/** Host port the dev MySQL is published on (bound to `127.0.0.1`) for direct DB access. */
	dbPort: number
	/** True when `dev.dbPort` was set in config — the user owns collisions, so don't auto-step. */
	dbPortExplicit: boolean
	/** Fixtures to seed on a fresh install; also carry the plugins they need. */
	fixtures: Fixture[]
	/** Fixed repo-relative folder holding the install (`.kizlo/local`). */
	wordpressPath: string
	/** Absolute path the whole install is bind-mounted to; wiped by `reset`. */
	wordpressDir: string
}

/**
 * Whether this project runs local WordPress under `kizlo dev` — `dev.local` is `true` in
 * `kizlo.config.*`. When false, `kizlo dev` has nothing to boot and runs the contract watcher alone,
 * the path a project pointing at its own WordPress takes. The flag is written by `create`/`init` when
 * local WordPress is chosen, and lives next to the rest of the `dev` config, so it's committed and
 * survives `kizlo dev reset`.
 */
export async function usesLocalWordPress(cwd: string): Promise<boolean> {
	const fileConfig = await loadConfigFile(findConfigDir(cwd))
	return Boolean(fileConfig?.dev?.local)
}

/**
 * Whether this project runs local WordPress under `kizlo test` — `test.local` is `true` in
 * `kizlo.config.*`. When false, `kizlo test` skips the Docker WordPress + seed and just runs the
 * project's own test script.
 */
export async function testUsesLocalWordPress(cwd: string): Promise<boolean> {
	const fileConfig = await loadConfigFile(findConfigDir(cwd))
	return Boolean(fileConfig?.test?.local)
}

/**
 * Resolve the `dev` block from `kizlo.config.*` into concrete values for the `dev` command, applying
 * defaults (port 8080). The install folder is fixed at `.kizlo/local` — no longer a config choice — so
 * there's nothing required here. Callers gate on {@link usesLocalWordPress} first, since a project
 * without local WordPress runs the watcher alone rather than reaching here.
 */
export async function resolveDevConfig(cwd: string): Promise<ResolvedDevConfig> {
	const configDir = findConfigDir(cwd)
	const fileConfig = await loadConfigFile(configDir)
	const dev = fileConfig?.dev ?? {}

	return {
		configDir,
		project: stackProject(resolveStackName(configDir, fileConfig?.name), "dev"),
		port: dev.port ?? DEFAULT_DEV_PORT,
		portExplicit: dev.port !== undefined,
		dbPort: dev.dbPort ?? DEFAULT_DEV_DB_PORT,
		dbPortExplicit: dev.dbPort !== undefined,
		fixtures: dev.fixtures ?? [],
		wordpressPath: LOCAL_DIR_REL,
		wordpressDir: path.resolve(configDir, LOCAL_DIR_REL),
	}
}
