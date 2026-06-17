import { randomBytes } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import * as p from "@clack/prompts"
import { defineCommand } from "citty"
import z from "zod/v4"
import { printBanner } from "../banner"
import { CONTRACT_BARREL } from "../daemon/generate"
import { detectPreset, getPreset, type InitContext, PRESETS, type Preset, type ScaffoldContext } from "../presets"
import {
	addDependencyArgs,
	detectImportAlias,
	detectPackageManager,
	ensureGitignored,
	envKeysPresent,
	getVersion,
	loadEnvFiles,
	mergeEnv,
	resolveModuleImport,
	runCommand,
	writeFileIfAbsent,
} from "../utils"

const WP_ENV_KEYS = ["SITE_SECRET", "WORDPRESS_URL", "WORDPRESS_USERNAME", "WORDPRESS_APPLICATION_PASSWORD"] as const

function envKeys(preset: Preset): readonly string[] {
	return [preset.baseUrlEnvKey, ...WP_ENV_KEYS]
}

interface Setup {
	baseUrl: string
	siteSecret: string
	wpUrl: string
	wpUsername: string
	wpPassword: string
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

function kizloConfigTemplate(dir: string, alias: string): string {
	const aliasLine = alias ? `\n\talias: "${alias}",` : ""
	return `import { defineConfig } from "kizlo/config"

export default defineConfig({
	dir: "${dir}",${aliasLine}
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

async function collectInteractively(ctx: { cwd: string; hasSrcDir: boolean; preset: Preset }): Promise<Setup> {
	const baseUrl = orCancel(
		await p.text({ message: "Public server base URL", placeholder: "https://your-app.com", validate: validate(urlString) }),
	)

	const secretMode = orCancel(
		await p.select({
			message: "SITE_SECRET (signing key)",
			initialValue: "generate" as const,
			options: [
				{ value: "generate" as const, label: "Generate a secure secret automatically", hint: "recommended" },
				{ value: "enter" as const, label: "Enter my own" },
			],
		}),
	)

	const siteSecret =
		secretMode === "enter"
			? orCancel(await p.password({ message: "Enter SITE_SECRET", validate: validate(requiredString) }))
			: randomBytes(32).toString("hex")

	const wpUrl = orCancel(await p.text({ message: "WordPress URL", placeholder: "https://wp.your-app.com", validate: validate(urlString) }))

	const wpUsername = orCancel(await p.text({ message: "WordPress username", validate: validate(requiredString) }))

	const wpPassword = orCancel(await p.password({ message: "WordPress application password", validate: validate(requiredString) }))

	const dir = orCancel(await p.text({ message: "Kizlo directory", initialValue: defaultDir(ctx.hasSrcDir), validate: validate(dirPath) }))

	// Only relevant when the preset scaffolds imports (e.g. the API route).
	let alias = ""
	if (ctx.preset.routeHandler) {
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

	return { baseUrl, siteSecret, wpUrl, wpUsername, wpPassword, dir, alias }
}

/**
 * Non-interactive setup: skip prompts and use defaults. Values present in the
 * environment are used; missing ones are left empty for the user to fill in
 * later. Never fails — `--yes` always scaffolds a fillable project.
 */
function collectFromEnv(ctx: { cwd: string; hasSrcDir: boolean; preset: Preset }): Setup {
	const dir = defaultDir(ctx.hasSrcDir)
	return {
		baseUrl: process.env[ctx.preset.baseUrlEnvKey]?.trim() ?? "",
		siteSecret: process.env.SITE_SECRET?.trim() || randomBytes(32).toString("hex"),
		wpUrl: process.env.WORDPRESS_URL?.trim() ?? "",
		wpUsername: process.env.WORDPRESS_USERNAME?.trim() ?? "",
		wpPassword: process.env.WORDPRESS_APPLICATION_PASSWORD?.trim() ?? "",
		dir,
		alias: ctx.preset.routeHandler ? aliasWithSlash(detectImportAlias(ctx.cwd, path.join(dir, "server"))?.prefix) : "",
	}
}

function readPkg(pkgPath: string): Record<string, unknown> {
	return JSON.parse(fs.readFileSync(pkgPath, "utf8")) as Record<string, unknown>
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

		// Non-interactive setup reads values from the environment; load the
		// project's .env first so re-runs reuse already-saved values.
		if (yes) loadEnvFiles(cwd)
		const setup = yes ? collectFromEnv({ cwd, hasSrcDir, preset }) : await collectInteractively({ cwd, hasSrcDir, preset })
		if (args.alias !== undefined) setup.alias = String(args.alias).trim()
		setup.alias = aliasWithSlash(setup.alias)

		// kizlo is required for the generated files to work. When run via `npx`
		// it isn't a project dependency yet, so add it; otherwise leave it alone.
		if (!hasKizlo) {
			const s = p.spinner()
			s.start(`Installing kizlo with ${pm}`)
			const ok = runCommand(addDependencyArgs(pm, "kizlo"), cwd, "ignore")
			s.stop(ok ? "Installed kizlo" : "Could not install kizlo automatically")
			if (!ok) p.log.warn(`Install it yourself: ${addDependencyArgs(pm, "kizlo").join(" ")}`)
		}

		// Supported frameworks mount the API at a sub-path; reflect it in the base
		// URL so the browser client and route handler agree on where requests go.
		if (preset.apiPath && setup.baseUrl) setup.baseUrl = withApiPath(setup.baseUrl, preset.apiPath)

		const keys = envKeys(preset)
		const envValues: Record<string, string> = {
			[preset.baseUrlEnvKey]: setup.baseUrl,
			SITE_SECRET: setup.siteSecret,
			WORDPRESS_URL: setup.wpUrl,
			WORDPRESS_USERNAME: setup.wpUsername,
			WORDPRESS_APPLICATION_PASSWORD: setup.wpPassword,
		}

		// .env — merge, never clobber other variables or existing Kizlo values without consent
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

		const merge = mergeEnv(existingEnv, envValues, overwriteKeys)
		fs.writeFileSync(envPath, merge.content)

		const exampleCreated = writeFileIfAbsent(path.join(cwd, ".env.example"), `${keys.map((key) => `${key}=`).join("\n")}\n`)

		// kizlo.config.ts — the daemon (`kizlo dev`/`generate`) reads dir from here
		const dirRel = setup.dir.replace(/^\.\//, "").replace(/\/+$/, "")
		const configCreated = writeFileIfAbsent(path.join(cwd, "kizlo.config.ts"), kizloConfigTemplate(dirRel, setup.alias))

		// Kizlo owns the layout under dir: server/, client.ts, server/generated/
		const serverDirRel = path.join(dirRel, "server")

		// Server entry — keep existing config unless explicitly overwritten
		const serverEntryRel = path.join(serverDirRel, "index.ts")
		const serverPath = path.join(cwd, serverEntryRel)
		const serverExisted = fs.existsSync(serverPath)
		let wroteServer = !serverExisted || force
		if (serverExisted && !force && !yes) {
			p.log.warn(`A Kizlo server instance already exists at ${serverEntryRel}`)
			wroteServer = orCancel(await p.confirm({ message: "Overwrite it?", initialValue: true }))
		}
		if (wroteServer) {
			fs.mkdirSync(path.dirname(serverPath), { recursive: true })
			fs.writeFileSync(serverPath, preset.serverEntry())
		}

		// Generated contract stub so the client typechecks before the first
		// `kizlo dev`; the daemon overwrites it on run.
		const generatedDirRel = path.join(serverDirRel, "generated")
		writeFileIfAbsent(path.join(cwd, generatedDirRel, "contract.json"), "{}\n")
		writeFileIfAbsent(path.join(cwd, generatedDirRel, "index.ts"), CONTRACT_BARREL)

		const scaffold: ScaffoldContext = {
			serverDirName: path.basename(serverDirRel),
			appDir: detectAppDir(cwd, hasSrcDir),
			serverImport: (fromDir) => resolveModuleImport(cwd, serverDirRel, fromDir, setup.alias),
		}

		// Browser client — at the Kizlo home root
		const clientRel = path.join(dirRel, "client.ts")
		const clientCreated = writeFileIfAbsent(path.join(cwd, clientRel), preset.clientEntry(scaffold))

		// API route handler — supported frameworks only
		let routeRel: string | undefined
		let routeCreated = false
		if (preset.routeHandler) {
			const route = preset.routeHandler(scaffold)
			routeRel = route.path
			routeCreated = writeFileIfAbsent(path.join(cwd, route.path), route.contents)
		}

		const gitignore = ensureGitignored(cwd, ".env")

		if (!envExisted) {
			p.log.success("Created .env")
		} else if (merge.updated.length || merge.added.length) {
			p.log.success("Updated .env")
		} else {
			p.log.info("Left .env unchanged")
		}
		p.log.success(exampleCreated ? "Created .env.example" : "Skipped .env.example (exists)")
		p.log.success(configCreated ? "Created kizlo.config.ts" : "Skipped kizlo.config.ts (exists)")
		if (wroteServer) p.log.success(`${serverExisted ? "Overwrote" : "Created"} Kizlo server instance (${serverEntryRel})`)
		else p.log.info(`Kept existing Kizlo server instance (${serverEntryRel})${yes ? " — pass --force to overwrite" : ""}`)
		p.log.success(clientCreated ? `Created browser client (${clientRel})` : "Skipped browser client (exists)")
		if (routeRel) p.log.success(routeCreated ? `Created API route (${routeRel})` : "Skipped API route (exists)")
		if (gitignore !== "present") p.log.success(`${gitignore === "created" ? "Created" : "Updated"} .gitignore (ignoring .env)`)

		p.note(
			[
				`Watch your extensions and regenerate the contract during development:`,
				`  npx kizlo dev`,
				``,
				`Generate the contract once for production builds:`,
				`  npx kizlo generate`,
			].join("\n"),
			"Next steps",
		)

		p.outro("Kizlo is ready 🎉")
	},
})
