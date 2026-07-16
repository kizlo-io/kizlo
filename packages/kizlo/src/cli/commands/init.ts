import { randomBytes } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import * as p from "@clack/prompts"
import { defineCommand } from "citty"
import z from "zod/v4"
import { printBanner } from "../banner"
import { DEFAULT_DEV_DB_PORT, DEFAULT_DEV_PORT, type ResolvedDevConfig, resolveStackName } from "../daemon/config"
import { CONTRACT_BARREL } from "../daemon/generate"
import { detectPreset, getPreset, type InitContext, PRESETS, type Preset, type ScaffoldContext, type ScaffoldFile } from "../presets"
import {
	addDependencyArgs,
	detectImportAlias,
	detectPackageManager,
	ensureGitignored,
	envGroups,
	envKeysPresent,
	getVersion,
	loadEnvFiles,
	mergeEnv,
	pickStackPort,
	resolveModuleImport,
	runCommand,
	writeFileIfAbsent,
} from "../utils"
import { createAdminAppPassword } from "../wp/bootstrap"
import { bootstrapDev } from "../wp/dev"
import { composeStop, createStack, dockerAvailable } from "../wp/docker"
import { removeProjectContainers } from "../wp/session"
import { syncSiteSettings } from "../wp/settings"
import { devStack } from "../wp/stack"

/** Production connection keys — what a real deploy needs, and what `.env.example` always lists. */
const PROD_WP_ENV_KEYS = [
	"KIZLO_SITE_SECRET",
	"KIZLO_WORDPRESS_URL",
	"KIZLO_WORDPRESS_USERNAME",
	"KIZLO_WORDPRESS_APPLICATION_PASSWORD",
] as const

/**
 * The `.env` keys init manages and the values to write, branched on the connection mode. A local
 * dev stack writes the `KIZLO_DEV_WORDPRESS_*` / `KIZLO_DEV_SITE_SECRET` set plus `KIZLO_TARGET=dev`, so it
 * never touches the production keys (a user can point those at a real site). A remote site writes the
 * bare production keys exactly as before — no `KIZLO_TARGET`, since `"production"` is the default target.
 */
function managedEnv(preset: Preset, setup: Setup): { keys: string[]; values: Record<string, string> } {
	if (setup.mode === "local") {
		return {
			keys: [
				preset.baseUrlEnvKey,
				"KIZLO_TARGET",
				"KIZLO_DEV_SITE_SECRET",
				"KIZLO_DEV_WORDPRESS_URL",
				"KIZLO_DEV_WORDPRESS_USERNAME",
				"KIZLO_DEV_WORDPRESS_APPLICATION_PASSWORD",
			],
			values: {
				[preset.baseUrlEnvKey]: setup.baseUrl,
				KIZLO_TARGET: "dev",
				KIZLO_DEV_SITE_SECRET: setup.siteSecret,
				KIZLO_DEV_WORDPRESS_URL: setup.wpUrl,
				KIZLO_DEV_WORDPRESS_USERNAME: setup.wpUsername,
				KIZLO_DEV_WORDPRESS_APPLICATION_PASSWORD: setup.wpPassword,
			},
		}
	}
	return {
		keys: [preset.baseUrlEnvKey, ...PROD_WP_ENV_KEYS],
		values: {
			[preset.baseUrlEnvKey]: setup.baseUrl,
			KIZLO_SITE_SECRET: setup.siteSecret,
			KIZLO_WORDPRESS_URL: setup.wpUrl,
			KIZLO_WORDPRESS_USERNAME: setup.wpUsername,
			KIZLO_WORDPRESS_APPLICATION_PASSWORD: setup.wpPassword,
		},
	}
}

interface Setup {
	/**
	 * Where the WordPress connection comes from. `local` spins up a Docker dev stack during
	 * init and fills the WP credentials from it; `remote` collects them from the user.
	 */
	mode: "local" | "remote"
	/** The Kizlo backend URL (where the handler is mounted); the plugin's `backend_url`. */
	baseUrl: string
	/**
	 * Canonical public site URL → plugin `url`. Set only for the base preset, where the backend can
	 * live on a different origin than the site. Framework presets leave it unset (the site URL is the
	 * backend's origin), and the local dev path never persists it.
	 */
	siteUrl?: string
	siteSecret: string
	wpUrl: string
	wpUsername: string
	wpPassword: string
	/** Folder the local WordPress install lives in (`dev.path`); set only when `mode` is `local`. */
	devPath?: string
	/** Kizlo's home directory; Kizlo owns the `server/`, `client.ts`, `generated/` layout inside. */
	dir: string
	/** Import alias prefix (e.g. `@`); empty string means relative imports. */
	alias: string
}

function defaultDir(hasSrcDir: boolean): string {
	return hasSrcDir ? "src/lib/kizlo" : "lib/kizlo"
}

/** Normalizes an alias prefix to the familiar `@/` form (or empty for relative). */
function aliasWithSlash(alias: string | undefined): string {
	return alias ? `${alias.replace(/\/+$/, "")}/` : ""
}

function kizloConfigTemplate(dir: string, alias: string, devPath?: string): string {
	const aliasLine = alias ? `\n\talias: "${alias}",` : ""
	const devLine = devPath ? `\n\tdev: { path: "${devPath}" },` : ""
	return `import { defineConfig } from "kizlo/config"

export default defineConfig({
	dir: "${dir}",${aliasLine}${devLine}
})
`
}

/** Appends the API path to the base URL so the client and route handler agree. */
function withApiPath(baseUrl: string, apiPath: string): string {
	try {
		const url = new URL(baseUrl)
		const current = url.pathname.replace(/\/+$/, "")
		if (current.endsWith(apiPath)) return url.toString().replace(/\/+$/, "")
		url.pathname = `${current}${apiPath}`
		return url.toString().replace(/\/+$/, "")
	} catch {
		return baseUrl
	}
}

/** Whether two URLs share an origin (scheme + host + port); false when either can't be parsed. */
function sameOrigin(a: string, b: string): boolean {
	try {
		return new URL(a).origin === new URL(b).origin
	} catch {
		return false
	}
}

function detectAppDir(cwd: string, hasSrcDir: boolean): string {
	if (fs.existsSync(path.join(cwd, "src", "app"))) return "src/app"
	if (fs.existsSync(path.join(cwd, "app"))) return "app"
	return hasSrcDir ? "src/app" : "app"
}

const requiredString = z.string().trim().min(1, "Required")
const urlString = requiredString.pipe(z.url("Must be a valid URL (e.g. https://example.com)"))
const dirPath = requiredString.refine((value) => !value.endsWith(".ts"), "Enter a directory, not a file")

function validate(schema: z.ZodType) {
	return (value: string | undefined): string | undefined => {
		const result = schema.safeParse(value ?? "")
		return result.success ? undefined : result.error.issues[0]?.message
	}
}

function orCancel<T>(value: T | symbol): T {
	if (p.isCancel(value)) {
		p.cancel("Setup cancelled.")
		process.exit(0)
	}
	return value as T
}

type ScaffoldResult = "created" | "overwritten" | "kept"

/**
 * The single overwrite policy for every scaffolded file: create it when absent, overwrite on
 * `--force`, and otherwise ask before clobbering an existing file (keeping it when the user
 * declines or when running non-interactively with `--yes`). Every scaffolded file routes through
 * here rather than deciding for itself, so new files inherit the same behavior for free.
 */
async function scaffoldFile(cwd: string, file: ScaffoldFile, opts: { force: boolean; yes: boolean }): Promise<ScaffoldResult> {
	const absPath = path.join(cwd, file.relPath)
	const existed = fs.existsSync(absPath)
	if (existed) {
		let overwrite = opts.force
		if (!opts.force && !opts.yes) {
			p.log.warn(`${file.label} already exists at ${file.relPath}`)
			overwrite = orCancel(await p.confirm({ message: "Overwrite it?", initialValue: true }))
		}
		if (!overwrite) return "kept"
	}
	fs.mkdirSync(path.dirname(absPath), { recursive: true })
	fs.writeFileSync(absPath, file.contents)
	return existed ? "overwritten" : "created"
}

/** Report a {@link scaffoldFile} outcome in init's usual voice. */
function reportScaffold(file: ScaffoldFile, result: ScaffoldResult, yes: boolean): void {
	if (result === "kept") {
		p.log.info(`Kept existing ${file.label} (${file.relPath})${yes ? " — pass --force to overwrite" : ""}`)
	} else {
		p.log.success(`${result === "overwritten" ? "Overwrote" : "Created"} ${file.label} (${file.relPath})`)
	}
}

async function collectInteractively(ctx: { cwd: string; hasSrcDir: boolean; preset: Preset }): Promise<Setup> {
	let siteUrl: string | undefined
	let baseUrl: string
	if (ctx.preset.apiPath) {
		baseUrl = orCancel(await p.text({ message: "Public app URL", placeholder: "https://your-app.com", validate: validate(urlString) }))
	} else {
		siteUrl = orCancel(await p.text({ message: "Public site URL", placeholder: "https://your-app.com", validate: validate(urlString) }))
		baseUrl = orCancel(
			await p.text({
				message: "Kizlo backend URL (where the handler is mounted)",
				placeholder: "https://your-app.com/kizlo",
				validate: validate(urlString),
			}),
		)
	}

	const secretMode = orCancel(
		await p.select({
			message: "Site secret (webhook signing key)",
			initialValue: "generate" as const,
			options: [
				{ value: "generate" as const, label: "Generate a secure secret automatically", hint: "recommended" },
				{ value: "enter" as const, label: "Enter my own" },
			],
		}),
	)

	const siteSecret =
		secretMode === "enter"
			? orCancel(await p.password({ message: "Enter the site secret", validate: validate(requiredString) }))
			: randomBytes(32).toString("hex")

	const mode = orCancel(
		await p.select({
			message: "WordPress connection",
			initialValue: "local" as const,
			options: [
				{ value: "local" as const, label: "Set up a local dev environment", hint: "runs WordPress in Docker" },
				{ value: "remote" as const, label: "Use my own WordPress", hint: "connect to an existing site" },
			],
		}),
	)

	let wpUrl = ""
	let wpUsername = ""
	let wpPassword = ""
	let devPath: string | undefined
	if (mode === "remote") {
		wpUrl = orCancel(await p.text({ message: "WordPress URL", placeholder: "https://wp.your-app.com", validate: validate(urlString) }))
		wpUsername = orCancel(await p.text({ message: "WordPress username", validate: validate(requiredString) }))
		wpPassword = orCancel(await p.password({ message: "WordPress application password", validate: validate(requiredString) }))
	} else {
		devPath = orCancel(await p.text({ message: "Local WordPress folder", initialValue: "wordpress", validate: validate(dirPath) }))
	}

	const dir = orCancel(await p.text({ message: "Kizlo directory", initialValue: defaultDir(ctx.hasSrcDir), validate: validate(dirPath) }))

	let alias = ""
	if (ctx.preset.apiPath) {
		const serverDir = path.join(dir.replace(/^\.\//, "").replace(/\/+$/, ""), "server")
		const detected = detectImportAlias(ctx.cwd, serverDir)?.prefix
		const answer = orCancel(
			await p.text({
				message: "Import alias (blank for relative imports)",
				placeholder: "@/",
				initialValue: detected ? `${detected}/` : "",
			}),
		)
		alias = answer.trim()
	}

	return { mode, baseUrl, siteUrl, siteSecret, wpUrl, wpUsername, wpPassword, devPath, dir, alias }
}

/**
 * Non-interactive setup: skip prompts and use defaults. Values present in the
 * environment are used; missing ones are left empty for the user to fill in
 * later. Never fails — `--yes` always scaffolds a fillable project.
 */
function collectFromEnv(ctx: { cwd: string; hasSrcDir: boolean; preset: Preset }): Setup {
	const dir = defaultDir(ctx.hasSrcDir)
	return {
		mode: "remote",
		baseUrl: process.env[ctx.preset.baseUrlEnvKey]?.trim() ?? "",
		siteSecret: process.env.KIZLO_SITE_SECRET?.trim() || randomBytes(32).toString("hex"),
		wpUrl: process.env.KIZLO_WORDPRESS_URL?.trim() ?? "",
		wpUsername: process.env.KIZLO_WORDPRESS_USERNAME?.trim() ?? "",
		wpPassword: process.env.KIZLO_WORDPRESS_APPLICATION_PASSWORD?.trim() ?? "",
		dir,
		alias: ctx.preset.apiPath ? aliasWithSlash(detectImportAlias(ctx.cwd, path.join(dir, "server"))?.prefix) : "",
	}
}

function readPkg(pkgPath: string): Record<string, unknown> {
	return JSON.parse(fs.readFileSync(pkgPath, "utf8")) as Record<string, unknown>
}

/** Build a {@link ResolvedDevConfig} from the chosen install folder, matching `resolveDevConfig`'s
 * defaults — built directly so init never has to round-trip through the config file it's writing. */
function devConfigFor(cwd: string, devPath: string): ResolvedDevConfig {
	return {
		configDir: cwd,
		project: `${resolveStackName(cwd)}-dev`,
		port: DEFAULT_DEV_PORT,
		portExplicit: false,
		dbPort: DEFAULT_DEV_DB_PORT,
		dbPortExplicit: false,
		fixtures: [],
		wordpressPath: devPath,
		wordpressDir: path.resolve(cwd, devPath),
	}
}

/** Connection details captured from a freshly provisioned local stack. */
interface LocalStack {
	url: string
	username: string
	/** REST application password minted for `.env` (the dev stack doesn't make one itself). */
	appPassword: string
	/** One-time wp-admin login password, shown only on a fresh install. */
	adminPassword?: string
	/** Set when pushing `KIZLO_DEV_SITE_SECRET` into the local plugin failed (warn-and-continue). */
	secretSyncError?: string
}

/**
 * Boot the local dev stack once to produce working credentials, then stop it (volumes
 * persist, so a later `kizlo dev` resumes instantly). The dev stack mints no application
 * password — that's a test-stack concern — so we create one here for REST auth in `.env`.
 * While the stack is still up, push the dev site settings (`siteSecret` plus the Kizlo server's
 * `url`/`backend_url`, derived from `baseUrl`) into the plugin so webhook signing and event delivery
 * work.
 */
async function provisionLocalStack(cfg: ResolvedDevConfig, siteSecret: string, baseUrl: string): Promise<LocalStack> {
	await removeProjectContainers(cfg.project)
	const port = await pickStackPort(cfg.port, { fixed: cfg.portExplicit, configKey: "dev.port" })
	const dbPort = await pickStackPort(cfg.dbPort, { fixed: cfg.dbPortExplicit, host: "127.0.0.1", configKey: "dev.dbPort" })
	const ready: ResolvedDevConfig = { ...cfg, port, dbPort }
	createStack(devStack(ready))

	const info = await bootstrapDev(ready)
	const appPassword = info.appPassword ?? (await createAdminAppPassword("kizlo"))
	const sync = await syncSiteSettings(
		{ url: info.url, username: info.username, password: appPassword },
		{ secret: siteSecret, backendUrl: baseUrl, containerized: true },
	)
	await composeStop()
	return {
		url: info.url,
		username: info.username,
		appPassword,
		adminPassword: info.secrets?.password,
		secretSyncError: sync.ok ? undefined : sync.error,
	}
}

export const init = defineCommand({
	meta: {
		name: "init",
		description: "Set up Kizlo in the current project",
	},
	args: {
		yes: {
			type: "boolean",
			alias: "y",
			description: "Skip prompts and scaffold with defaults (non-interactive)",
			default: false,
		},
		force: {
			type: "boolean",
			alias: "f",
			description: "Overwrite existing .env values and server entry without asking",
			default: false,
		},
		preset: {
			type: "string",
			description: `Force a setup preset (${PRESETS.map((preset) => preset.id).join(", ")})`,
		},
		alias: {
			type: "string",
			description: "Import alias prefix for generated imports (e.g. @); blank for relative",
		},
	},
	async run({ args }) {
		const yes = Boolean(args.yes)
		const force = Boolean(args.force)
		const cwd = process.cwd()
		const pkgPath = path.join(cwd, "package.json")

		if (!yes) printBanner(getVersion())
		p.intro("kizlo init")

		if (!fs.existsSync(pkgPath)) {
			p.cancel("No package.json found — run `kizlo init` inside a project.")
			process.exit(1)
		}

		const pkg = readPkg(pkgPath) as {
			dependencies?: Record<string, string>
			devDependencies?: Record<string, string>
		}

		const pm = detectPackageManager(cwd)
		const hasKizlo = Boolean(pkg.dependencies?.kizlo) || Boolean(pkg.devDependencies?.kizlo)
		const hasSrcDir = fs.existsSync(path.join(cwd, "src"))

		const initCtx: InitContext = { cwd, pkg, pm, hasSrcDir }

		let preset: Preset
		if (args.preset) {
			const chosen = getPreset(String(args.preset))
			if (!chosen) {
				p.cancel(`Unknown preset "${args.preset}". Available: ${PRESETS.map((pr) => pr.id).join(", ")}`)
				process.exit(1)
			}
			preset = chosen
		} else {
			preset = detectPreset(initCtx)
			if (preset.id !== "base") p.log.success(`${preset.label} detected`)
		}

		if (yes) loadEnvFiles(cwd)
		const setup = yes ? collectFromEnv({ cwd, hasSrcDir, preset }) : await collectInteractively({ cwd, hasSrcDir, preset })
		if (args.alias !== undefined) setup.alias = String(args.alias).trim()
		setup.alias = aliasWithSlash(setup.alias)

		if (setup.mode === "local" && !(await dockerAvailable())) {
			p.cancel("Docker isn't available — start Docker (or install it) and re-run, or choose “Use my own WordPress”.")
			process.exit(1)
		}

		if (!hasKizlo) {
			const s = p.spinner()
			s.start(`Installing kizlo with ${pm}`)
			const ok = runCommand(addDependencyArgs(pm, "kizlo@latest"), cwd, "ignore")
			s.stop(ok ? "Installed kizlo" : "Could not install kizlo automatically")
			if (!ok) p.log.warn(`Install it yourself: ${addDependencyArgs(pm, "kizlo@latest").join(" ")}`)
		}

		if (preset.apiPath && setup.baseUrl) setup.baseUrl = withApiPath(setup.baseUrl, preset.apiPath)

		let adminPassword: string | undefined
		if (setup.mode === "local" && setup.devPath) {
			ensureGitignored(cwd, setup.devPath)
			const s = p.spinner()
			s.start("Setting up local WordPress (first run downloads images, this can take a while)")
			try {
				const local = await provisionLocalStack(devConfigFor(cwd, setup.devPath), setup.siteSecret, setup.baseUrl)
				setup.wpUrl = local.url
				setup.wpUsername = local.username
				setup.wpPassword = local.appPassword
				adminPassword = local.adminPassword
				s.stop("Local WordPress ready")
				if (local.secretSyncError) p.log.warn(`Could not sync KIZLO_DEV_SITE_SECRET to the local plugin (${local.secretSyncError})`)
			} catch (error) {
				s.stop("Local WordPress setup failed")
				p.cancel(error instanceof Error ? error.message : String(error))
				process.exit(1)
			}
		}

		const { keys, values: envValues } = managedEnv(preset, setup)

		const envPath = path.join(cwd, ".env")
		const envExisted = fs.existsSync(envPath)
		const existingEnv = envExisted ? fs.readFileSync(envPath, "utf8") : ""
		const conflicts = envKeysPresent(existingEnv, keys)

		let overwriteKeys = new Set<string>(keys)
		if (conflicts.length && !force) {
			if (yes) {
				overwriteKeys = new Set()
				p.log.info("Keeping existing .env values (pass --force to overwrite)")
			} else {
				p.log.warn("Some environment variables already exist in .env")
				const overwrite = orCancel(await p.confirm({ message: "Overwrite their existing values?", initialValue: true }))
				if (!overwrite) overwriteKeys = new Set()
			}
		}

		const merge = mergeEnv(existingEnv, envValues, overwriteKeys, envGroups(preset.baseUrlEnvKey))
		fs.writeFileSync(envPath, merge.content)

		if (setup.mode === "remote" && setup.wpUrl && setup.wpUsername && setup.wpPassword) {
			const sync = await syncSiteSettings(
				{ url: setup.wpUrl, username: setup.wpUsername, password: setup.wpPassword },
				{ secret: setup.siteSecret, siteUrl: setup.siteUrl, backendUrl: setup.baseUrl },
			)
			if (!sync.ok)
				p.log.warn(
					`Could not sync the site settings to WordPress (${sync.error}) — make sure the kizlo plugin is active, then set them from the Kizlo settings.`,
				)
		}

		const exampleKeys = [preset.baseUrlEnvKey, ...PROD_WP_ENV_KEYS]
		const exampleValues = Object.fromEntries(exampleKeys.map((key) => [key, ""]))
		const { content: exampleEnv } = mergeEnv("", exampleValues, new Set(exampleKeys), envGroups(preset.baseUrlEnvKey))
		const exampleBody = `${exampleEnv}\n# Point the app at a local dev stack (managed by \`kizlo dev\`) instead of the keys above:\n# KIZLO_TARGET=dev\n`
		const exampleCreated = writeFileIfAbsent(path.join(cwd, ".env.example"), exampleBody)

		const dirRel = setup.dir.replace(/^\.\//, "").replace(/\/+$/, "")

		const serverDirRel = path.join(dirRel, "server")

		const clientUrl = setup.siteUrl && !sameOrigin(setup.siteUrl, setup.baseUrl) ? setup.baseUrl : undefined

		const scaffold: ScaffoldContext = {
			serverDirName: path.basename(serverDirRel),
			serverEntryPath: path.join(serverDirRel, "index.ts"),
			clientPath: path.join(dirRel, "client.ts"),
			appDir: detectAppDir(cwd, hasSrcDir),
			serverImport: (fromDir) => resolveModuleImport(cwd, serverDirRel, fromDir, setup.alias),
			clientUrl,
		}

		const files: ScaffoldFile[] = [
			{ label: "Kizlo config", relPath: "kizlo.config.ts", contents: kizloConfigTemplate(dirRel, setup.alias, setup.devPath) },
			...preset.scaffolds(scaffold),
		]

		const scaffolded: { file: ScaffoldFile; result: ScaffoldResult }[] = []
		for (const file of files) scaffolded.push({ file, result: await scaffoldFile(cwd, file, { force, yes }) })

		const generatedDirRel = path.join(serverDirRel, "generated")
		writeFileIfAbsent(path.join(cwd, generatedDirRel, "contract.json"), "{}\n")
		writeFileIfAbsent(path.join(cwd, generatedDirRel, "index.ts"), CONTRACT_BARREL)

		const gitignore = ensureGitignored(cwd, ".env")

		if (!envExisted) {
			p.log.success("Created .env")
		} else if (merge.updated.length || merge.added.length) {
			p.log.success("Updated .env")
		} else {
			p.log.info("Left .env unchanged")
		}
		p.log.success(exampleCreated ? "Created .env.example" : "Skipped .env.example (exists)")
		for (const { file, result } of scaffolded) reportScaffold(file, result, yes)
		if (gitignore !== "present") p.log.success(`${gitignore === "created" ? "Created" : "Updated"} .gitignore (ignoring .env)`)

		if (setup.mode === "local") {
			p.log.success(`Local WordPress configured (${setup.devPath}) — .env points at ${setup.wpUrl}`)
			if (adminPassword) p.log.warn(`wp-admin login: ${setup.wpUsername} / ${adminPassword} — save it, it's shown only once`)
		}

		p.note(
			[
				...(setup.mode === "local"
					? [`Start your local WordPress dev stack (also watches your extensions):`, `  npx kizlo dev`, ``]
					: [`Watch your extensions and regenerate the contract during development:`, `  npx kizlo watch`, ``]),
				`Generate the contract once for production builds:`,
				`  npx kizlo generate`,
			].join("\n"),
			"Next steps",
		)

		p.outro("Kizlo is ready 🎉")
	},
})
