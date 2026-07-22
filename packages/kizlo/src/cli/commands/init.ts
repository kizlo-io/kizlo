import fs from "node:fs"
import path from "node:path"
import * as p from "@clack/prompts"
import { defineCommand } from "citty"
import { printBanner } from "../banner"
import { CONTRACT_BARREL } from "../daemon/generate"
import { detectPreset, getPreset, type InitContext, PRESETS, type Preset, type ScaffoldContext, type ScaffoldFile } from "../presets"
import { applyPatchToSource, patchChanged, resolvePatch, resolvePatchTargetPath, templatePatches } from "../presets/patch"
import {
	addDependencyArgs,
	detectImportAlias,
	detectPackageManager,
	ensureGitignored,
	getVersion,
	loadEnvFiles,
	resolveModuleImport,
	runCommand,
	writeFileIfAbsent,
} from "../utils"
import { dockerAvailable } from "../wp/docker"
import {
	type Connection,
	collectConnectionFromEnv,
	collectConnectionInteractively,
	dirPath,
	nextStepsNote,
	orCancel,
	setupLocalWordPress,
	syncRemote,
	validate,
	withApiPath,
	writeEnv,
} from "./_setup"

/** init's connection plus the framework-specific choices only init makes. */
type Setup = Connection & {
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
	const conn = await collectConnectionInteractively(ctx.preset)

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

	return { ...conn, dir, alias }
}

/**
 * Non-interactive setup: skip prompts and use defaults. Values present in the
 * environment are used; missing ones are left empty for the user to fill in
 * later. Never fails — `--yes` always scaffolds a fillable project.
 */
function collectFromEnv(ctx: { cwd: string; hasSrcDir: boolean; preset: Preset }): Setup {
	const conn = collectConnectionFromEnv(ctx.preset)
	const dir = defaultDir(ctx.hasSrcDir)
	return {
		...conn,
		dir,
		alias: ctx.preset.apiPath ? aliasWithSlash(detectImportAlias(ctx.cwd, path.join(dir, "server"))?.prefix) : "",
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

		await setupLocalWordPress(cwd, setup)

		await writeEnv(cwd, preset, setup, { force, yes })
		await syncRemote(setup)

		const dirRel = setup.dir.replace(/^\.\//, "").replace(/\/+$/, "")
		const serverDirRel = path.join(dirRel, "server")
		const clientUrl = setup.siteUrl && !sameOrigin(setup.siteUrl, setup.baseUrl) ? setup.baseUrl : undefined

		const scaffold: ScaffoldContext = {
			kizloDir: dirRel,
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

		for (const { file, result } of scaffolded) reportScaffold(file, result, yes)

		// Merge Kizlo wiring into files the project already owns (e.g. the root layout's SEO
		// metadata). Unlike scaffolded files, these are edited in place: additive changes always
		// apply; an export the user already defines is only replaced with consent (force/confirm).
		for (const patch of templatePatches(preset.id)) {
			const resolved = resolvePatch(patch, scaffold)
			const abs = resolvePatchTargetPath(cwd, resolved.relPath)
			if (!abs) {
				p.log.info(`Skipped ${resolved.label} wiring — ${resolved.relPath} not found (add it yourself)`)
				continue
			}
			const relTarget = path.relative(cwd, abs)
			const src = fs.readFileSync(abs, "utf8")
			// A file we can't parse is one we must not guess at: stop rather than write corrupted source.
			let text: string
			let changes: ReturnType<typeof applyPatchToSource>["changes"]
			try {
				;({ text, changes } = applyPatchToSource(src, resolved, { replaceConflicts: force }))
			} catch (err) {
				p.log.error(
					`Could not parse ${resolved.label} (${relTarget}) to wire Kizlo into it: ${err instanceof Error ? err.message : String(err)}`,
				)
				throw err
			}
			if (!force && !yes && changes.keptExports.length) {
				p.log.warn(`${resolved.label} (${relTarget}) already defines ${changes.keptExports.join(", ")}`)
				const replace = orCancel(await p.confirm({ message: "Replace with Kizlo's version?", initialValue: true }))
				if (replace) ({ text, changes } = applyPatchToSource(src, resolved, { replaceConflicts: true }))
			}
			if (patchChanged(changes)) {
				fs.writeFileSync(abs, text)
				const parts = [
					...(changes.replacedExports.length ? [`replaced ${changes.replacedExports.join(", ")}`] : []),
					...(changes.addedExports.length ? [`added ${changes.addedExports.join(", ")}`] : []),
					...(changes.addedImports.length ? ["imports"] : []),
				]
				p.log.success(`Wired Kizlo into your ${resolved.label} (${relTarget}) — ${parts.join(", ")}`)
			}
			if (changes.keptExports.length) {
				p.log.info(`Kept your existing ${changes.keptExports.join(", ")} in ${resolved.label} — pass --force to replace`)
			} else if (!patchChanged(changes)) {
				p.log.info(`Your ${resolved.label} is already wired (${relTarget})`)
			}
		}

		if (gitignore !== "present") p.log.success(`${gitignore === "created" ? "Created" : "Updated"} .gitignore (ignoring .env)`)

		nextStepsNote(setup.mode)

		p.outro("Kizlo is ready 🎉")
	},
})
