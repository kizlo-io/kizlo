import fs from "node:fs"
import path from "node:path"
import { createJiti } from "jiti"
import z from "zod/v4"
import type { KizloGlobalConfig } from "../../config"
import { detectPackageManager, type PackageManager } from "../utils"
import type { Fixture } from "../wp/types"
import { credentialsPath, findConfigDir } from "../wp/utils"
import { log } from "./logger"

// Fixtures carry functions (seed/cleanup), so validate only that each is an
// object with a string `name`; z.custom passes the value through untouched.
const fixtureSchema = z.custom<Fixture>(
	(value) => typeof value === "object" && value !== null && typeof (value as { name?: unknown }).name === "string",
	{ message: "must be a fixture object with a string `name` (use defineFixture)" },
)

/** Runtime shape of `kizlo.config.*` — mirrors {@link KizloGlobalConfig}. */
const configSchema = z.object({
	dir: z.string().optional(),
	alias: z.string().optional(),
	test: z
		.object({
			port: z.number().int().positive().optional(),
			fixtures: z.array(fixtureSchema).optional(),
			packageManager: z.enum(["npm", "pnpm", "yarn", "bun"]).optional(),
			command: z.string().optional(),
		})
		.optional(),
})

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

function defaultDir(cwd: string): string {
	return fs.existsSync(path.join(cwd, "src")) ? "src/lib/kizlo" : "lib/kizlo"
}

async function loadConfigFile(cwd: string): Promise<KizloGlobalConfig | undefined> {
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

export interface ResolvedTestConfig {
	/** Directory holding `kizlo.config.*` (the credentials artifact root). */
	configDir: string
	/** Resolved credentials artifact path under `configDir`. */
	credentialsPath: string
	port: number
	fixtures: Fixture[]
	packageManager: PackageManager
	/** Explicit override; when unset, callers run `<packageManager> test`. */
	command?: string
}

/**
 * Resolve the `test` block from `kizlo.config.*` into concrete values for the
 * `wp`/`test` commands, applying defaults (port 8080, auto-detected package
 * manager) and anchoring the credentials artifact to the config directory.
 */
export async function resolveTestConfig(cwd: string): Promise<ResolvedTestConfig> {
	const configDir = findConfigDir(cwd)
	const fileConfig = await loadConfigFile(configDir)
	const test = fileConfig?.test ?? {}

	return {
		configDir,
		command: test.command,
		port: test.port ?? 8080,
		fixtures: test.fixtures ?? [],
		credentialsPath: credentialsPath(cwd),
		packageManager: test.packageManager ?? detectPackageManager(configDir),
	}
}
