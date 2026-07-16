import fs from "node:fs"
import path from "node:path"
import { createJiti } from "jiti"
import z from "zod/v4"
import type { KizloGlobalConfig } from "../../config"
import { detectPackageManager, type PackageManager } from "../utils"
import type { Fixture } from "../wp/types"
import { credentialsPath, findConfigDir } from "../wp/utils"
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
			path: z.string().optional(),
			port: z.number().int().positive().optional(),
			dbPort: z.number().int().positive().optional(),
			byo: z.string().optional(),
			fixtures: z.array(fixtureSchema).optional(),
		})
		.optional(),
	test: z
		.object({
			port: z.number().int().positive().optional(),
			fixtures: z.array(fixtureSchema).optional(),
			packageManager: z.enum(["npm", "pnpm", "yarn", "bun"]).optional(),
			command: z.string().optional(),
		})
		.optional(),
})

/**
 * Parsed config shape. Looser than {@link KizloGlobalConfig} on purpose: the public
 * type marks `dev.path` required for good authoring DX, but a loaded file might omit
 * it — `resolveDevConfig` enforces it at runtime with a guiding message.
 */
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

const CONFIG_FILES = ["kizlo.config.ts", "kizlo.config.js", "kizlo.config.mjs"]

export const DEFAULT_DEV_PORT = 8080
export const DEFAULT_DEV_DB_PORT = 3307
const DEFAULT_TEST_PORT = 8889

function defaultDir(cwd: string): string {
	return fs.existsSync(path.join(cwd, "src")) ? "src/lib/kizlo" : "lib/kizlo"
}

async function loadConfigFile(cwd: string): Promise<LoadedConfig | undefined> {
	const file = CONFIG_FILES.map((name) => path.join(cwd, name)).find((p) => fs.existsSync(p))
	if (!file) return undefined

	let raw: unknown
	try {
		const jiti = createJiti(cwd, { moduleCache: false })
		const mod = await jiti.import<{ default?: KizloGlobalConfig } & KizloGlobalConfig>(file)
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

export async function resolveConfig(cwd: string, flags?: { dir?: string }): Promise<ResolvedConfig> {
	const fileConfig = await loadConfigFile(cwd)
	const raw = flags?.dir ?? fileConfig?.dir ?? defaultDir(cwd)
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

export interface ResolvedTestConfig {
	/** Directory holding `kizlo.config.*` (the credentials artifact root). */
	configDir: string
	/** Docker compose project name (`<name>-test`). */
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
		project: `${resolveStackName(configDir, fileConfig?.name)}-test`,
		command: test.command,
		port: test.port ?? DEFAULT_TEST_PORT,
		portExplicit: test.port !== undefined,
		fixtures: test.fixtures ?? [],
		credentialsPath: credentialsPath(cwd),
		packageManager: test.packageManager ?? detectPackageManager(configDir),
	}
}

export interface ResolvedDevConfig {
	/** Directory holding `kizlo.config.*`. */
	configDir: string
	/** Docker compose project name (`<name>-dev`). */
	project: string
	port: number
	/** True when `dev.port` was set in config — the user owns collisions, so don't auto-step. */
	portExplicit: boolean
	/** Host port the dev MySQL is published on (bound to `127.0.0.1`) for direct DB access. */
	dbPort: number
	/** True when `dev.dbPort` was set in config — the user owns collisions, so don't auto-step. */
	dbPortExplicit: boolean
	/** Absolute path to a BYO archive (`wordpress/` + `.sql`) to hydrate a fresh stack from, if set. */
	byo?: string
	/** Fixtures to seed on a fresh stack (mutually exclusive with `byo`); also carry the stack's plugins. */
	fixtures: Fixture[]
	/** Repo-relative folder holding the install (from `dev.path`); used for gitignore. */
	wordpressPath: string
	/** Absolute path the whole install is bind-mounted to; wiped by `reset`. */
	wordpressDir: string
}

/**
 * Resolve the `dev` block from `kizlo.config.*` into concrete values for the `dev`
 * command, applying defaults (port 8080). `dev.path` is required — the whole
 * WordPress install lives there, so we make the user choose a real folder rather
 * than hide it under a default.
 */
export async function resolveDevConfig(cwd: string): Promise<ResolvedDevConfig> {
	const configDir = findConfigDir(cwd)
	const fileConfig = await loadConfigFile(configDir)
	const dev = fileConfig?.dev ?? {}

	if (!dev.path) {
		log.error(
			"`dev.path` is required in kizlo.config — it's the folder your local WordPress lives in.\n" +
				'Pick a real, visible folder (it persists your site between runs), e.g. dev: { path: "wordpress" }.',
		)
		process.exit(1)
	}

	if (dev.byo && dev.fixtures?.length) {
		log.error("`dev.byo` and `dev.fixtures` are mutually exclusive — byo imports an existing site, so it brings its own data.")
		process.exit(1)
	}

	return {
		configDir,
		project: `${resolveStackName(configDir, fileConfig?.name)}-dev`,
		port: dev.port ?? DEFAULT_DEV_PORT,
		portExplicit: dev.port !== undefined,
		dbPort: dev.dbPort ?? DEFAULT_DEV_DB_PORT,
		dbPortExplicit: dev.dbPort !== undefined,
		byo: dev.byo ? path.resolve(configDir, dev.byo) : undefined,
		fixtures: dev.fixtures ?? [],
		wordpressPath: dev.path,
		wordpressDir: path.resolve(configDir, dev.path),
	}
}
