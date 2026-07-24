import fs from "node:fs"
import path from "node:path"
import * as p from "@clack/prompts"
import { defineCommand } from "citty"
import { detectPreset, getPreset, type InitContext, PRESETS, type Preset, type ScaffoldFile } from "../presets"
import { fetchTemplate } from "../presets/source"
import { adaptFile, changesFor, fileEntries, patchEntries, readManifest, type TemplateManifest } from "../presets/template"
import {
	addDependencyArgs,
	detectImportAlias,
	detectPackageManager,
	ensureGitignored,
	getVersion,
	loadEnvFiles,
	runCommandAsync,
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
import {
	applyLayoutPatches,
	buildScaffoldContext,
	kizloConfigTemplate,
	reportScaffold,
	type ScaffoldResult,
	scaffoldFile,
	writeGeneratedContract,
} from "./_wiring"

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

type Deps = { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }

function kizloDep(pkg: Deps): string | undefined {
	return pkg.dependencies?.kizlo ?? pkg.devDependencies?.kizlo
}

/** A bare `x.y.z` from a version spec (range prefix and pre-release/build metadata dropped); undefined if none. */
function coerceVersion(spec: string): [number, number, number] | undefined {
	const match = /(\d+)\.(\d+)\.(\d+)/.exec(spec)
	return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined
}

/** Whether `have` is a strictly older release than `want`; false when either can't be compared. */
function isOlder(have: string, want: string): boolean {
	const a = coerceVersion(have)
	const b = coerceVersion(want)
	if (!a || !b) return false
	for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return (a[i] as number) < (b[i] as number)
	return false
}

/**
 * The template is authoritative for the kizlo version: it declares `kizloVersion` in its manifest
 * (stamped at release), falling back to the running CLI's version in-repo before the first stamp.
 * When the project's kizlo is older, upgrade the project up to it and say so — a deliberate pin is
 * never changed silently. Never downgrades.
 */
async function alignKizloVersion(
	cwd: string,
	pm: ReturnType<typeof detectPackageManager>,
	pkg: Deps,
	manifest: TemplateManifest,
): Promise<void> {
	const want = manifest.kizloVersion ?? `^${getVersion()}`
	const have = kizloDep(pkg)
	if (!have || !isOlder(have, want)) return
	const s = p.spinner()
	s.start(`Upgrading kizlo from ${have} to ${want}`)
	const ok = await runCommandAsync(addDependencyArgs(pm, `kizlo@${want}`), cwd, "ignore")
	s.stop(ok ? `Upgraded kizlo to ${want}` : `Could not upgrade kizlo automatically — install kizlo@${want} yourself`)
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

		p.intro(`Let's configure Kizlo in your existing application`)

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

		if (preset.template === "nextjs" && !fs.existsSync(path.join(cwd, "app")) && !fs.existsSync(path.join(cwd, "src/app"))) {
			p.cancel("Kizlo needs the Next.js App Router — no `app` or `src/app` directory found. The Pages Router isn't supported.")
			process.exit(1)
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
			const spec = `kizlo@^${getVersion()}`
			const s = p.spinner()
			s.start(`Installing kizlo with ${pm}`)
			const ok = await runCommandAsync(addDependencyArgs(pm, spec), cwd, "ignore")
			s.stop(ok ? "Installed kizlo" : "Could not install kizlo automatically")
			if (!ok) p.log.warn(`Install it yourself: ${addDependencyArgs(pm, spec).join(" ")}`)
		}

		if (preset.apiPath && setup.baseUrl) setup.baseUrl = withApiPath(setup.baseUrl, preset.apiPath)

		await setupLocalWordPress(cwd, setup)

		await writeEnv(cwd, preset, setup, { force, yes })
		await syncRemote(setup)

		const dirRel = setup.dir.replace(/^\.\//, "").replace(/\/+$/, "")
		const serverDirRel = path.join(dirRel, "server")
		const clientUrl = setup.siteUrl && !sameOrigin(setup.siteUrl, setup.baseUrl) ? setup.baseUrl : undefined

		const scaffold = buildScaffoldContext(cwd, { dirRel, appDir: detectAppDir(cwd, hasSrcDir), alias: setup.alias, clientUrl })

		const files: ScaffoldFile[] = [
			{ label: "Kizlo config", relPath: "kizlo.config.ts", contents: kizloConfigTemplate(dirRel, setup.alias, setup.devPath) },
		]

		let manifest: TemplateManifest | undefined
		if (preset.template) {
			const fetched = await fetchTemplate(preset.template)
			try {
				manifest = readManifest(fetched.dir)
				await alignKizloVersion(cwd, pm, pkg, manifest)
				for (const entry of fileEntries(changesFor(manifest, "init")))
					files.push(adaptFile(fetched.dir, entry, manifest.conventions, scaffold))
			} finally {
				fetched.cleanup()
			}
		} else if (preset.scaffolds) {
			files.push(...preset.scaffolds(scaffold))
		}

		const scaffolded: { file: ScaffoldFile; result: ScaffoldResult }[] = []
		for (const file of files) scaffolded.push({ file, result: await scaffoldFile(cwd, file, { force, yes }) })

		writeGeneratedContract(cwd, serverDirRel)

		const gitignore = ensureGitignored(cwd, ".env")

		for (const { file, result } of scaffolded) reportScaffold(file, result, yes)

		if (manifest) applyLayoutPatches(cwd, patchEntries(changesFor(manifest, "init")), manifest.conventions, scaffold)

		if (gitignore !== "present") p.log.success(`${gitignore === "created" ? "Created" : "Updated"} .gitignore (ignoring .env)`)

		nextStepsNote(setup)

		p.outro("Kizlo is ready 🎉")
	},
})
