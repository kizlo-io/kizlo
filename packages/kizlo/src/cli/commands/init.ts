import fs from "node:fs"
import path from "node:path"
import * as p from "@clack/prompts"
import { defineCommand } from "citty"
import type { ScaffoldFile } from "../presets"
import {
	DEFAULT_REGISTRY,
	detectTemplates,
	fetchRegistry,
	isSingleTemplate,
	listTemplates,
	resolveRegistry,
	type TemplateEntry,
} from "../presets/source"
import {
	adaptFile,
	changesFor,
	fileEntries,
	isOlderVersion,
	minCliError,
	patchEntries,
	readManifest,
	renderNote,
	resolveDependencies,
	type TemplateManifest,
} from "../presets/template"
import {
	addDependencyArgs,
	detectImportAlias,
	detectPackageManager,
	type EnvKeys,
	ensureGitignored,
	getVersion,
	loadEnvFiles,
	runCommandAsync,
} from "../utils"
import {
	type Connection,
	collectConnectionFromEnv,
	collectConnectionInteractively,
	dirPath,
	nextStepsNote,
	orCancel,
	readEnvExample,
	resolveEnvKeys,
	setupLocalWordPress,
	syncRemote,
	validate,
	withApiPath,
	writeEnv,
} from "./_setup"
import {
	applyProjectPatches,
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

/**
 * The framework's route directory in the user's project. When a template is present its
 * `conventions.appDir` (e.g. `src/app` for Next, `src/pages` for Astro) is the expected layout; we
 * probe that path and its no-`src` variant so a project that keeps routes at the top level is still
 * found, falling back to whether the project has a `src` dir. With no known template appDir we keep the
 * App Router default.
 */
function detectAppDir(cwd: string, hasSrcDir: boolean, templateAppDir?: string): string {
	if (templateAppDir) {
		const withoutSrc = templateAppDir.replace(/^src\//, "")
		if (fs.existsSync(path.join(cwd, templateAppDir))) return templateAppDir
		if (fs.existsSync(path.join(cwd, withoutSrc))) return withoutSrc
		return hasSrcDir ? templateAppDir : withoutSrc
	}
	if (fs.existsSync(path.join(cwd, "src", "app"))) return "src/app"
	if (fs.existsSync(path.join(cwd, "app"))) return "app"
	return hasSrcDir ? "src/app" : "app"
}

async function collectInteractively(ctx: { cwd: string; hasSrcDir: boolean; apiPath?: string }): Promise<Setup> {
	const dir = orCancel(await p.text({ message: "Kizlo directory", initialValue: defaultDir(ctx.hasSrcDir), validate: validate(dirPath) }))

	let alias = ""
	if (ctx.apiPath) {
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

	const conn = await collectConnectionInteractively(ctx.apiPath)

	return { ...conn, dir, alias }
}

/**
 * Non-interactive setup: skip prompts and use defaults. Values present in the
 * environment are used; missing ones are left empty for the user to fill in
 * later. Never fails — `--yes` always scaffolds a fillable project.
 */
function collectFromEnv(ctx: { cwd: string; hasSrcDir: boolean; apiPath?: string; envKeys: EnvKeys }): Setup {
	const conn = collectConnectionFromEnv(ctx.envKeys)
	const dir = defaultDir(ctx.hasSrcDir)
	return {
		...conn,
		dir,
		alias: ctx.apiPath ? aliasWithSlash(detectImportAlias(ctx.cwd, path.join(dir, "server"))?.prefix) : "",
	}
}

function readPkg(pkgPath: string): Record<string, unknown> {
	return JSON.parse(fs.readFileSync(pkgPath, "utf8")) as Record<string, unknown>
}

type Deps = { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }

/**
 * The template is authoritative for the pinned versions: it declares `dependencies`/`devDependencies`
 * in its manifest (stamped at release), falling back to the running CLI's version for `kizlo` in-repo
 * before the first stamp. For each declared package the project already has at an older release, upgrade
 * it up to the template's pin and say so — a deliberate pin is never changed silently. Never downgrades,
 * and never adds a package the project doesn't already have (a missing `kizlo` is installed separately).
 */
async function alignDependencies(
	cwd: string,
	pm: ReturnType<typeof detectPackageManager>,
	pkg: Deps,
	manifest: TemplateManifest,
): Promise<void> {
	const { dependencies, devDependencies } = resolveDependencies(manifest)
	for (const [name, want] of [...Object.entries(dependencies), ...Object.entries(devDependencies)]) {
		const have = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name]
		if (!have || !isOlderVersion(have, want)) continue
		const s = p.spinner()
		s.start(`Upgrading ${name} from ${have} to ${want}`)
		const ok = await runCommandAsync(addDependencyArgs(pm, `${name}@${want}`), cwd, "ignore")
		s.stop(ok ? `Upgraded ${name} to ${want}` : `Could not upgrade ${name} automatically — install ${name}@${want} yourself`)
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
		alias: {
			type: "string",
			description: "Import alias prefix for generated imports (e.g. @); blank for relative",
		},
		source: {
			type: "string",
			description:
				"Where to wire from — a local dir or giget source, either a registry of templates or a single template (default: Kizlo's GitHub templates)",
		},
	},
	async run({ args }) {
		const yes = Boolean(args.yes)
		const force = Boolean(args.force)
		const cwd = process.cwd()
		const pkgPath = path.join(cwd, "package.json")

		p.intro(`Let's configure Kizlo in your existing application`)

		if (!fs.existsSync(pkgPath)) {
			p.note(
				[
					"`kizlo init` adds Kizlo to an existing app, but this directory has no package.json.",
					"",
					"Start a new project (scaffolds an app with Kizlo already wired):",
					"  npx kizlo@latest create",
					"",
					"Already have an app? cd into it, then run `kizlo init` again.",
				].join("\n"),
				"Nothing to configure here",
			)
			p.cancel("No package.json found in this directory.")
			process.exit(1)
		}

		const pkg = readPkg(pkgPath) as {
			dependencies?: Record<string, string>
			devDependencies?: Record<string, string>
		}

		const pm = detectPackageManager(cwd)
		const hasKizlo = Boolean(pkg.dependencies?.kizlo) || Boolean(pkg.devDependencies?.kizlo)
		const hasSrcDir = fs.existsSync(path.join(cwd, "src"))

		if (yes) loadEnvFiles(cwd)

		const registry = resolveRegistry(args.source ? String(args.source) : undefined)
		let fetchedRegistry: Awaited<ReturnType<typeof fetchRegistry>>
		try {
			fetchedRegistry = await fetchRegistry(registry)
		} catch (error) {
			p.cancel(error instanceof Error ? error.message : String(error))
			process.exit(1)
		}

		const cancelFrom = (message: string): never => {
			fetchedRegistry.cleanup()
			p.cancel(message)
			process.exit(1)
		}

		try {
			const entries = listTemplates(fetchedRegistry.dir)
			if (entries.length === 0) cancelFrom(`No templates found in ${registry.source}. Each template needs a template.json.`)

			const projectDeps = { ...pkg.dependencies, ...pkg.devDependencies }
			let entry: TemplateEntry | undefined

			if (isSingleTemplate(fetchedRegistry.dir)) {
				const [only] = entries
				entry = only
				if (only && detectTemplates(entries, projectDeps).length === 0) {
					p.log.warn(`The ${only.label} template doesn't match this project's dependencies — detection may be off on either side.`)
					const proceed = yes || orCancel(await p.confirm({ message: `Apply ${only.label} anyway?`, initialValue: false }))
					if (!proceed) cancelFrom("Cancelled. Point --source at a template that matches this project, or omit it to auto-detect.")
				}
			} else {
				const matched = detectTemplates(entries, projectDeps)
				const [first] = matched
				if (matched.length === 0) {
					p.log.warn(
						`Couldn't find a template matching this project's framework ${registry.source === DEFAULT_REGISTRY ? "in Kizlo templates" : `at your provided source ${registry.source}`}.`,
					)
					if (yes) cancelFrom(`Re-run with --source pointing at the single template you want, or run without --yes to pick one manually.`)
					const proceed = orCancel(await p.confirm({ message: "Pick a template manually anyway?", initialValue: false }))
					if (!proceed) cancelFrom("Cancelled.")
					const id = orCancel(
						await p.select({
							message: "Choose a template to apply",
							options: entries.map((e) => ({ value: e.id, label: e.label })),
						}),
					)
					entry = entries.find((e) => e.id === id)
				} else if (matched.length === 1 && first) {
					entry = first
					p.log.success(`${first.label} detected`)
				} else {
					const ids = matched.map((e) => e.id).join(", ")
					if (yes)
						cancelFrom(`Multiple templates match this project (${ids}). Re-run with --source pointing at the single template you want.`)
					const id = orCancel(
						await p.select({
							message: "Multiple templates match this project — pick one",
							options: matched.map((e) => ({ value: e.id, label: e.label })),
						}),
					)
					entry = matched.find((e) => e.id === id)
				}
			}

			if (!entry) return cancelFrom("No template selected.")

			const manifest = readManifest(entry.dir)
			const minErr = minCliError(manifest)
			if (minErr) cancelFrom(minErr)
			if (manifest.requires && !manifest.requires.anyDir.some((rel) => fs.existsSync(path.join(cwd, rel)))) {
				cancelFrom(manifest.requires.message)
			}

			const apiPath = manifest.apiPath
			const envKeys = resolveEnvKeys(manifest)

			const setup = yes ? collectFromEnv({ cwd, hasSrcDir, apiPath, envKeys }) : await collectInteractively({ cwd, hasSrcDir, apiPath })
			if (args.alias !== undefined) setup.alias = String(args.alias).trim()
			setup.alias = aliasWithSlash(setup.alias)

			const includeExamples = yes ? true : orCancel(await p.confirm({ message: "Add example pages?", initialValue: true }))

			if (!hasKizlo) {
				const spec = `kizlo@${manifest.dependencies?.kizlo ?? `^${getVersion()}`}`
				const s = p.spinner()
				s.start(`Installing kizlo with ${pm}`)
				const ok = await runCommandAsync(addDependencyArgs(pm, spec), cwd, "ignore")
				s.stop(ok ? "Installed kizlo" : "Could not install kizlo automatically")
				if (!ok) p.log.warn(`Install it yourself: ${addDependencyArgs(pm, spec).join(" ")}`)
			}

			if (apiPath && setup.baseUrl) setup.baseUrl = withApiPath(setup.baseUrl, apiPath)

			await setupLocalWordPress(cwd, setup)

			await writeEnv(cwd, envKeys, setup, { force, yes, exampleTemplate: readEnvExample(entry.dir) })
			await syncRemote(setup)

			const dirRel = setup.dir.replace(/^\.\//, "").replace(/\/+$/, "")
			const serverDirRel = path.join(dirRel, "server")
			const clientUrl = setup.siteUrl && !sameOrigin(setup.siteUrl, setup.baseUrl) ? setup.baseUrl : undefined

			const appDir = detectAppDir(cwd, hasSrcDir, manifest.conventions.appDir)
			const scaffold = buildScaffoldContext(cwd, { dirRel, appDir, alias: setup.alias, clientUrl })

			const files: ScaffoldFile[] = [
				{ label: "Kizlo config", relPath: "kizlo.config.ts", contents: kizloConfigTemplate(dirRel, setup.alias, setup.mode === "local") },
			]

			await alignDependencies(cwd, pm, pkg, manifest)
			for (const fileEntry of fileEntries(changesFor(manifest, "init", { includeExamples })))
				files.push(adaptFile(entry.dir, fileEntry, manifest.conventions, scaffold))

			const scaffolded: { file: ScaffoldFile; result: ScaffoldResult }[] = []
			for (const file of files) scaffolded.push({ file, result: await scaffoldFile(cwd, file, { force, yes }) })

			writeGeneratedContract(cwd, serverDirRel)

			const gitignore = ensureGitignored(cwd, ".env")
			ensureGitignored(cwd, ".kizlo/")

			for (const { file, result } of scaffolded) reportScaffold(file, result, yes)

			applyProjectPatches(cwd, patchEntries(changesFor(manifest, "init")), manifest.conventions, scaffold)

			for (const note of manifest.notes ?? []) {
				const rendered = renderNote(note, setup.alias)
				p.note(rendered.body, rendered.title)
			}

			if (gitignore !== "present") p.log.success(`${gitignore === "created" ? "Created" : "Updated"} .gitignore (ignoring .env)`)

			nextStepsNote(setup)

			p.outro("Kizlo is ready 🎉")
		} finally {
			fetchedRegistry.cleanup()
		}
	},
})
