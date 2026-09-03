import fs from "node:fs"
import path from "node:path"
import z from "zod/v4"
import type { KizloGlobalConfig } from "../../config"
import { detectPackageManager, type PackageManager } from "../utils"
import { DEFAULT_WORDPRESS_TAG, INTROSPECTION_META_REL, LOCAL_DIR_REL } from "../wp/constants"
import type { Fixture } from "../wp/types"
import { credentialsPath, findConfigDir } from "../wp/utils"
import { WORDPRESS_TAG_PATTERN } from "../wp/version"
import { importIgnoringVirtualModules } from "./jiti"
import { log } from "./logger"

const fixtureSchema = z.custom<Fixture>(
	(value) => typeof value === "object" && value !== null && typeof (value as { name?: unknown }).name === "string",
	{ message: "must be a fixture object with a string `name` (use defineFixture)" },
)

/**
 * `local.dev.version` / `local.test.version`. Validated against Docker's tag grammar here rather than
 * at boot, so `"wordpress:7.1.0"`, which would resolve to `wordpress:wordpress:7.1.0`, is named as a
 * config mistake instead of surfacing as a pull failure seconds into starting a stack.
 */
const versionSchema = z
	.string()
	.regex(WORDPRESS_TAG_PATTERN, 'must be a WordPress image tag, like "7.1.0" or "7.1.0-php8.3-apache" (no "wordpress:" prefix)')

/**
 * A key that moved in the config redesign. It accepts only `undefined`, so an absent key passes and a
 * present one fails validation with a message naming where it went: a hard cutover with no silent
 * fallback. {@link loadConfigFile} surfaces the message through `z.prettifyError`.
 */
const removedKey = (message: string) => z.undefined({ error: message }).optional()

const dirSchema = z.union([
	z.string(),
	z.object({
		server: z.string().optional(),
		contract: z.string().optional(),
		introspection: z.string().optional(),
	}),
])

const devStackSchema = z.object({
	enable: z.boolean().optional(),
	port: z.number().int().positive().optional(),
	version: versionSchema.optional(),
	dbPort: z.number().int().positive().optional(),
	fixtures: z.array(fixtureSchema).optional(),
})

const testStackSchema = z.object({
	enable: z.boolean().optional(),
	inherit: z.boolean().optional(),
	port: z.number().int().positive().optional(),
	version: versionSchema.optional(),
	fixtures: z.array(fixtureSchema).optional(),
	packageManager: z.enum(["npm", "pnpm", "yarn", "bun"]).optional(),
	command: z.string().optional(),
})

const localSchema = z.union([
	z.boolean(),
	z.object({
		enable: z.boolean().optional(),
		name: z.string().optional(),
		worktrees: z.boolean().optional(),
		dev: devStackSchema.optional(),
		test: testStackSchema.optional(),
	}),
])

/** Runtime shape of `kizlo.config.*` — mirrors {@link KizloGlobalConfig}. */
const configSchema = z.object({
	dir: dirSchema.optional(),
	alias: z.string().optional(),
	local: localSchema.optional(),
	// Keys removed in the config redesign, each failing with the replacement to move to.
	wordpressClientDir: removedKey("`wordpressClientDir` has been removed. Use `dir: { introspection }` instead."),
	name: removedKey("`name` is no longer a config root key. Move it under `local.name`."),
	worktrees: removedKey("`worktrees` is no longer a config root key. Move it under `local.worktrees`."),
	dev: removedKey("`dev` is no longer a config root key. Move it under `local.dev`."),
	test: removedKey("`test` is no longer a config root key. Move it under `local.test`."),
})

/** Parsed config shape — mirrors {@link KizloGlobalConfig}, with every block optional. */
type LoadedConfig = z.infer<typeof configSchema>

/** The object form of `local`, with the two booleans and the stacks it can carry. */
type LocalObject = Exclude<NonNullable<LoadedConfig["local"]>, boolean>
type DevStack = NonNullable<LocalObject["dev"]>
type TestStack = NonNullable<LocalObject["test"]>

interface ResolvedLocal {
	/** Whether local WordPress is on at all (`local === true` or the object with `enable !== false`). */
	enabled: boolean
	name?: string
	worktrees?: boolean
	dev: DevStack
	test: TestStack
}

/** Normalize `local` (absent, `true`, `false`, or the object form) into one shape the resolvers read. */
function resolveLocal(fileConfig?: LoadedConfig): ResolvedLocal {
	const local = fileConfig?.local
	if (local === true) return { enabled: true, dev: {}, test: {} }
	if (!local) return { enabled: false, dev: {}, test: {} }
	return {
		enabled: local.enable !== false,
		name: local.name,
		worktrees: local.worktrees,
		dev: local.dev ?? {},
		test: local.test ?? {},
	}
}

/** The server sources a project has, when `dir` resolves one: watched, and the source of the contract. */
export interface ResolvedServer {
	/** Server sources directory (watched by `kizlo dev`). */
	dir: string
	/** The server entry (`index.ts`) whose `procedures` export builds the contract. */
	entry: string
	/** Directory `contract.json` and the generated barrel are written to. */
	contractDir: string
	contractPath: string
	barrelPath: string
}

export interface ResolvedConfig {
	cwd: string
	/**
	 * The server layout, present only when `dir` resolves a `server` path: the string form always does,
	 * the object form only when `server` is set. Absent means introspection-only: nothing to watch, no
	 * contract to build.
	 */
	server?: ResolvedServer
	/** The generated `introspection.ts`, always written whether or not a server is present. */
	introspectionPath: string
	/** Fetch cache, under `.kizlo/` rather than the generated dir: it is local state, not an artifact. */
	introspectionMetaPath: string
}

export const CONFIG_FILES = ["kizlo.config.ts", "kizlo.config.js", "kizlo.config.mjs"]

export const DEFAULT_DEV_PORT = 8080
export const DEFAULT_DEV_DB_PORT = 3307
const DEFAULT_TEST_PORT = 8889

/** The generated introspection artifact's filename, written under its resolved directory. */
const INTROSPECTION_FILE = "introspection.ts"

/** Strip a leading `./` and trailing slashes so a config path joins cleanly. */
function normalizeDir(value: string): string {
	return value.replace(/^\.\//, "").replace(/\/+$/, "")
}

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
 * Resolve what Kizlo generates and watches from `dir`: the `--dir` flag or `dir` in `kizlo.config.*`.
 * A string is the home Kizlo owns the layout under (sources in `<dir>/server`, generated files under
 * `<dir>/server/generated`); the object form sets `server` / `contract` / `introspection` independently.
 *
 * The introspection is always generated at its resolved path, so a project with no server still gets it.
 * `server` is present only when `dir` resolves a server path (the string form always does, the object
 * form only when `server` is set), and its absence means there is nothing to watch and no contract to
 * build. Returns `undefined` only when nothing at all is configured (no `dir`, or an object naming
 * neither a server nor an introspection path): there is then nothing to generate.
 */
export async function resolveConfig(cwd: string, flags?: { dir?: string }): Promise<ResolvedConfig | undefined> {
	const fileConfig = await loadConfigFile(cwd)
	const raw = flags?.dir ?? fileConfig?.dir
	if (raw === undefined) return undefined

	if (typeof raw === "string") {
		const home = normalizeDir(raw)
		const serverDir = path.join(home, "server")
		const contractDir = path.join(serverDir, "generated")
		return {
			cwd,
			server: {
				dir: serverDir,
				entry: path.join(serverDir, "index.ts"),
				contractDir,
				contractPath: path.join(contractDir, "contract.json"),
				barrelPath: path.join(contractDir, "index.ts"),
			},
			introspectionPath: path.join(contractDir, INTROSPECTION_FILE),
			introspectionMetaPath: INTROSPECTION_META_REL,
		}
	}

	const serverDir = raw.server ? normalizeDir(raw.server) : undefined
	const contractDir = serverDir ? (raw.contract ? normalizeDir(raw.contract) : path.join(serverDir, "generated")) : undefined
	const server: ResolvedServer | undefined =
		serverDir && contractDir
			? {
					dir: serverDir,
					entry: path.join(serverDir, "index.ts"),
					contractDir,
					contractPath: path.join(contractDir, "contract.json"),
					barrelPath: path.join(contractDir, "index.ts"),
				}
			: undefined

	// Where the introspection lands: an explicit `introspection` dir wins, else it sits beside the
	// contract under a server's `generated/`. With neither there is nothing to generate.
	const introspectionDir = raw.introspection ? normalizeDir(raw.introspection) : contractDir
	if (!introspectionDir) return undefined

	return {
		cwd,
		server,
		introspectionPath: path.join(introspectionDir, INTROSPECTION_FILE),
		introspectionMetaPath: INTROSPECTION_META_REL,
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

const HEAD_REF_PREFIX = "ref: refs/heads/"

/**
 * The branch checked out at `dir`, read out of git's own files rather than by running git, so this
 * stays synchronous and works where git isn't on PATH. `.git` is a directory in a main checkout and
 * a file holding `gitdir: <path>` in a linked worktree, which is what makes each worktree report its
 * own branch. Returns undefined when there is no branch to name: no repository, an unreadable one, or
 * a detached `HEAD`, which holds a commit id instead of a ref.
 */
function currentBranch(dir: string): string | undefined {
	try {
		const dotGit = path.join(dir, ".git")
		let gitDir = dotGit
		if (fs.statSync(dotGit).isFile()) {
			const pointer = fs.readFileSync(dotGit, "utf8").match(/^gitdir:\s*(.+)$/m)
			if (!pointer?.[1]) return undefined
			gitDir = path.resolve(dir, pointer[1].trim())
		}

		const head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim()
		return head.startsWith(HEAD_REF_PREFIX) ? head.slice(HEAD_REF_PREFIX.length) : undefined
	} catch {
		return undefined
	}
}

/**
 * Base name for the local stacks: the config `name` if set, else the `package.json`
 * `name` at `configDir`, else the config dir basename — sanitized to a Docker id.
 *
 * With `worktrees` on, the checked-out branch is appended rather than replacing that name, so
 * sibling checkouts of one project separate while two unrelated projects sitting on the same branch
 * stay apart. Replacing it would collide those two, which is this option's own bug one level up.
 */
export function resolveStackName(configDir: string, { name, worktrees }: { name?: string; worktrees?: boolean } = {}): string {
	const base = name ? sanitizeProjectName(name) : sanitizeProjectName(packageName(configDir) ?? path.basename(configDir))
	if (!worktrees) return base

	const branch = currentBranch(configDir)
	return branch ? `${base}-${sanitizeProjectName(branch)}` : base
}

function packageName(configDir: string): string | undefined {
	try {
		const pkg = JSON.parse(fs.readFileSync(path.join(configDir, "package.json"), "utf8")) as { name?: string }
		return pkg.name
	} catch {
		return undefined
	}
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
	/** True when local WordPress is enabled and the test stack is on, so `kizlo test` boots it before running the suite. */
	local: boolean
	/** Docker compose project name (`kizlo-<name>-test`). */
	project: string
	/** Resolved credentials artifact path under `configDir`. */
	credentialsPath: string
	port: number
	/**
	 * True when `test.port` was set in config — the user owns collisions, so don't auto-step.
	 * Always false under `worktrees`: a pinned port names one stack, and there is a stack per branch.
	 */
	portExplicit: boolean
	/**
	 * WordPress image tag the stack boots (`wordpress:<tag>`), from `local.test.version`, the inherited
	 * `local.dev.version`, or the version Kizlo pins. Supplied to compose as `WP_IMAGE_TAG`.
	 */
	wordpressTag: string
	fixtures: Fixture[]
	packageManager: PackageManager
	/** Explicit override; when unset, callers run `<packageManager> test`. */
	command?: string
}

/**
 * Resolve the test stack (`local.test`) into concrete values for the `test` command, applying defaults
 * (port 8889, auto-detected package manager) and anchoring the credentials artifact to the config
 * directory. `version` and `fixtures` fall back to the dev stack unless `test.inherit` is `false`;
 * `port`, `packageManager`, and `command` are never inherited.
 */
export async function resolveTestConfig(cwd: string): Promise<ResolvedTestConfig> {
	const configDir = findConfigDir(cwd)
	const fileConfig = await loadConfigFile(configDir)
	const local = resolveLocal(fileConfig)
	const { dev, test } = local
	const inherit = test.inherit !== false

	return {
		configDir,
		local: local.enabled && test.enable !== false,
		project: stackProject(resolveStackName(configDir, { name: local.name, worktrees: local.worktrees }), "test"),
		command: test.command,
		port: test.port ?? DEFAULT_TEST_PORT,
		portExplicit: test.port !== undefined && !local.worktrees,
		wordpressTag: test.version ?? (inherit ? dev.version : undefined) ?? DEFAULT_WORDPRESS_TAG,
		fixtures: test.fixtures ?? (inherit ? dev.fixtures : undefined) ?? [],
		credentialsPath: credentialsPath(cwd),
		packageManager: test.packageManager ?? (await detectPackageManager(configDir)) ?? "npm",
	}
}

export interface ResolvedDevConfig {
	/** Directory holding `kizlo.config.*`. */
	configDir: string
	/** Docker compose project name (`kizlo-<name>-dev`). */
	project: string
	port: number
	/**
	 * True when `local.dev.port` was set in config, so the user owns collisions and we don't auto-step.
	 * Always false under `worktrees`: a pinned port names one stack, and there is a stack per branch.
	 */
	portExplicit: boolean
	/** Host port the dev MySQL is published on (bound to `127.0.0.1`) for direct DB access. */
	dbPort: number
	/**
	 * True when `local.dev.dbPort` was set in config, so the user owns collisions and we don't auto-step.
	 * Always false under `worktrees`, for the same reason as {@link ResolvedDevConfig.portExplicit}.
	 */
	dbPortExplicit: boolean
	/**
	 * WordPress image tag the stack boots (`wordpress:<tag>`), from `local.dev.version` or the version
	 * Kizlo pins. Supplied to compose as `WP_IMAGE_TAG`.
	 */
	wordpressTag: string
	/** Fixtures to seed on a fresh install; also carry the plugins they need. */
	fixtures: Fixture[]
	/** Fixed repo-relative folder holding the install (`.kizlo/local`). */
	wordpressPath: string
	/** Absolute path the whole install is bind-mounted to; wiped by `reset`. */
	wordpressDir: string
}

/**
 * Whether this project runs local WordPress under `kizlo dev`: local is enabled and the dev stack is
 * on (`local.dev.enable !== false`) in `kizlo.config.*`. When false, `kizlo dev` has nothing to boot and
 * runs the contract watcher alone, the path a project pointing at its own WordPress takes. Written by
 * `create`/`init` when local WordPress is chosen, so it's committed and survives `kizlo dev reset`.
 */
export async function usesLocalWordPress(cwd: string): Promise<boolean> {
	const local = resolveLocal(await loadConfigFile(findConfigDir(cwd)))
	return local.enabled && local.dev.enable !== false
}

/**
 * Resolve the dev stack (`local.dev`) into concrete values for the `dev` command, applying defaults
 * (port 8080). The install folder is fixed at `.kizlo/local` (no longer a config choice), so there's
 * nothing required here. Callers gate on {@link usesLocalWordPress} first, since a project without
 * local WordPress runs the watcher alone rather than reaching here.
 */
export async function resolveDevConfig(cwd: string): Promise<ResolvedDevConfig> {
	const configDir = findConfigDir(cwd)
	const fileConfig = await loadConfigFile(configDir)
	const local = resolveLocal(fileConfig)
	const { dev } = local

	return {
		configDir,
		project: stackProject(resolveStackName(configDir, { name: local.name, worktrees: local.worktrees }), "dev"),
		port: dev.port ?? DEFAULT_DEV_PORT,
		portExplicit: dev.port !== undefined && !local.worktrees,
		dbPort: dev.dbPort ?? DEFAULT_DEV_DB_PORT,
		dbPortExplicit: dev.dbPort !== undefined && !local.worktrees,
		wordpressTag: dev.version ?? DEFAULT_WORDPRESS_TAG,
		fixtures: dev.fixtures ?? [],
		wordpressPath: LOCAL_DIR_REL,
		wordpressDir: path.resolve(configDir, LOCAL_DIR_REL),
	}
}
