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
	unmetRequirement,
} from "../presets/template"
import {
	addDependencyArgs,
	aliasWithSlash,
	detectImportAlias,
	detectInvokingPackageManager,
	detectPackageManager,
	type EnvKeys,
	effectiveAlias,
	ensureGitignored,
	getVersion,
	loadEnvFiles,
	type PackageManager,
	persistPackageManagerField,
	readPersistedAlias,
	runCommandAsync,
} from "../utils"
import {
	type Connection,
	collectConnectionFromEnv,
	collectConnectionInteractively,
	dirPath,
	envConflicts,
	nextStepsNote,
	orCancel,
	provisionLocalWordPress,
	readEnvExample,
	resolveEnvKeys,
	selectPackageManager,
	syncRemote,
	validate,
	withApiPath,
	writeEnv,
} from "./_setup"
import { confirmProceed, FINAL_CONFIRMATION_TEXT, runChecklist, StepError, summaryNote } from "./_tasks"
import {
	applyProjectPatches,
	buildScaffoldContext,
	kizloConfigTemplate,
	printManualStep,
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

/** Whether two URLs share an origin (scheme + host + port); false when either can't be parsed. */
function sameOrigin(a: string, b: string): boolean {
	try {
		return new URL(a).origin === new URL(b).origin
	} catch {
		return false
	}
}

/**
 * The import alias settled without asking — the explicit `--alias` flag, else the alias a previous init
 * persisted in kizlo.config. `undefined` when neither is set: the choice hasn't been made, so it must be
 * prompted for (interactive) or defaulted to relative imports (`--yes`). Detection never enters here — a
 * tsconfig alias is only ever a prompt *hint*, since relative imports always work and a detected alias
 * isn't a guarantee (a project may have several, or map one Kizlo's dir isn't under).
 */
function decidedAlias(flagAlias: string | undefined, persistedAlias: string | undefined): string | undefined {
	return flagAlias ?? persistedAlias
}

type AliasCtx = { cwd: string; hasSrcDir: boolean; apiPath?: string; persistedAlias?: string; flagAlias?: string }

async function collectInteractively(ctx: AliasCtx): Promise<Setup> {
	const dir = orCancel(await p.text({ message: "Kizlo directory", initialValue: defaultDir(ctx.hasSrcDir), validate: validate(dirPath) }))

	let alias = decidedAlias(ctx.flagAlias, ctx.persistedAlias)
	if (alias === undefined) {
		// No flag and nothing persisted — the choice hasn't been made yet. Ask once (only for templates
		// whose files carry alias imports), offering any tsconfig alias as a hint. A blank answer means
		// relative imports; either way the answer is persisted below, so later runs skip this prompt.
		if (ctx.apiPath) {
			const serverDir = path.join(dir.replace(/^\.\//, "").replace(/\/+$/, ""), "server")
			const detected = detectImportAlias(ctx.cwd, serverDir)?.prefix
			alias = orCancel(
				await p.text({
					message: "Import alias (blank for relative imports)",
					placeholder: "@/",
					initialValue: detected ? `${detected}/` : "",
				}),
			).trim()
		} else {
			alias = ""
		}
	}

	const conn = await collectConnectionInteractively(ctx.apiPath)

	return { ...conn, dir, alias }
}

/**
 * Non-interactive setup: skip prompts and use defaults. Values present in the environment are used;
 * missing ones are left empty for the user to fill in later. The alias is the `--alias` flag, else the
 * one persisted from a prior run, else relative imports — never silent tsconfig detection, since `--yes`
 * can't confirm it and relative imports always work. Never fails — `--yes` always scaffolds a fillable
 * project.
 */
function collectFromEnv(ctx: AliasCtx & { envKeys: EnvKeys }): Setup {
	const conn = collectConnectionFromEnv(ctx.envKeys)
	const dir = defaultDir(ctx.hasSrcDir)
	return { ...conn, dir, alias: decidedAlias(ctx.flagAlias, ctx.persistedAlias) ?? "" }
}

function readPkg(pkgPath: string): Record<string, unknown> {
	return JSON.parse(fs.readFileSync(pkgPath, "utf8")) as Record<string, unknown>
}

type Deps = { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }

/**
 * Bring the project's dependencies in line with the template's pins. The template is authoritative for
 * the versions: it declares `dependencies`/`devDependencies` in its manifest (stamped at release),
 * falling back to the running CLI's version for `kizlo` in-repo before the first stamp. For each declared
 * package:
 *
 * - missing from the project — install it at the template's pin, as a dev dependency when the template
 *   declares it there. `create` records the template's whole dependency set into the fresh app before
 *   installing; `init` layers onto an existing project, so packages the template needs but the project
 *   lacks (e.g. Astro's `@astrojs/node` adapter) must be added here or the app won't run.
 * - present at an older release — upgrade it up to the pin and say so; a deliberate newer pin is never
 *   changed silently, and nothing is ever downgraded.
 *
 * A *missing* `kizlo` is installed on its own earlier (with its own messaging), so it's skipped here;
 * an existing older `kizlo` still gets the upgrade path.
 */
async function alignDependencies(
	cwd: string,
	pm: PackageManager,
	pkg: Deps,
	manifest: TemplateManifest,
	message: (text: string) => void,
	warnings: string[],
): Promise<string> {
	const { dependencies, devDependencies } = resolveDependencies(manifest)
	const declared = [
		...Object.entries(dependencies).map(([name, want]) => ({ name, want, dev: false })),
		...Object.entries(devDependencies).map(([name, want]) => ({ name, want, dev: true })),
	]
	let installed = 0
	let upgraded = 0
	for (const { name, want, dev } of declared) {
		const have = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name]
		if (name === "kizlo" && !have) continue
		if (have && !isOlderVersion(have, want)) continue
		const args = addDependencyArgs(pm, `${name}@${want}`, { dev })
		message(have ? `Upgrading ${name} from ${have} to ${want}` : `Installing ${name}@${want}`)
		const ok = await runCommandAsync(args, cwd, "ignore")
		if (!ok) {
			warnings.push(
				have
					? `Could not upgrade ${name} automatically — install ${name}@${want} yourself`
					: `Could not install ${name} — run \`${args.join(" ")}\` yourself`,
			)
			continue
		}
		if (have) upgraded++
		else installed++
	}
	const parts = [installed ? `installed ${installed}` : "", upgraded ? `upgraded ${upgraded}` : ""].filter(Boolean)
	return parts.length ? `Aligned dependencies (${parts.join(", ")})` : "Dependencies already aligned"
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

		// A lockfile or corepack field settles the manager outright; otherwise we don't guess (the invoking
		// manager lies under `npx`) — interactively we ask, and `--yes` opts out of prompts so it takes the
		// invoking manager as its best non-interactive guess, falling back to npm.
		const detectedPm = await detectPackageManager(cwd)
		const pm =
			detectedPm ??
			(yes
				? (detectInvokingPackageManager() ?? "npm")
				: await selectPackageManager("Couldn't detect this project's package manager — which should Kizlo use?"))

		// When the project gave no signal and we had to ask, we stamp the choice into package.json so a later
		// run detects it instead of prompting again — deferred to the execute phase so nothing is written
		// before the user confirms. Skipped under `--yes`: that path only guessed, never confirmed.
		const shouldPersistPm = !detectedPm && !yes
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
			const unmet = unmetRequirement(manifest.init.requires, projectDeps, (rel) => fs.existsSync(path.join(cwd, rel)))
			if (unmet) cancelFrom(unmet)

			const apiPath = manifest.config.apiPath
			const envKeys = resolveEnvKeys(manifest)

			// Alias precedence: the explicit `--alias` flag, then the alias persisted in kizlo.config by a
			// prior run, then a one-time prompt (interactive) or relative imports (`--yes`). The chosen value
			// is persisted into kizlo.config below, so a later `init` reads it back instead of re-asking.
			const flagAlias = args.alias !== undefined ? String(args.alias).trim() : undefined
			const persistedAlias = readPersistedAlias(cwd)
			const aliasCtx = { cwd, hasSrcDir, apiPath, persistedAlias, flagAlias }
			const setup = yes ? collectFromEnv({ ...aliasCtx, envKeys }) : await collectInteractively(aliasCtx)
			const dirRel = setup.dir.replace(/^\.\//, "").replace(/\/+$/, "")

			// Whatever the alias came from, it is only a preference until the project's tsconfig backs it up.
			// Resolving it here makes what gets persisted, summarized and printed as manual steps all agree
			// with the imports actually written, since every one of them reads `setup.alias` below.
			const requestedAlias = aliasWithSlash(setup.alias)
			setup.alias = aliasWithSlash(effectiveAlias(cwd, dirRel, setup.alias))
			const droppedAlias = requestedAlias && !setup.alias ? requestedAlias : undefined
			if (apiPath && setup.baseUrl) setup.baseUrl = withApiPath(setup.baseUrl, apiPath)

			const includeExamples = yes ? true : orCancel(await p.confirm({ message: "Add example pages?", initialValue: true }))

			// Build the file plan in memory (no writes yet) so existing files can be surfaced before anything
			// runs — the overwrite decision is made here, during collection, not asked mid-checklist.
			const serverDirRel = path.join(dirRel, "server")
			const clientUrl = setup.siteUrl && !sameOrigin(setup.siteUrl, setup.baseUrl) ? setup.baseUrl : undefined
			const scaffold = buildScaffoldContext(cwd, { dirRel, hasSrcDir, alias: setup.alias, clientUrl })

			const files: ScaffoldFile[] = [
				{ label: "Kizlo config", relPath: "kizlo.config.ts", contents: kizloConfigTemplate(dirRel, setup.alias, setup.mode === "local") },
			]
			for (const fileEntry of fileEntries(changesFor(manifest, "init", { includeExamples })))
				files.push(adaptFile(entry.dir, fileEntry, manifest.config, scaffold))

			// Resolve both overwrite decisions up front: `--force` overwrites, `--yes` keeps, and interactively
			// we only ask when something actually collides. Files are chosen individually via a multiselect
			// (all pre-selected, so Enter overwrites everything) — deselect a file to keep it as-is.
			const existingFiles = files.filter((file) => fs.existsSync(path.join(cwd, file.relPath)))
			const overwritePaths: ReadonlySet<string> =
				force || existingFiles.length === 0 || yes
					? new Set(force ? existingFiles.map((f) => f.relPath) : [])
					: new Set(
							orCancel(
								await p.multiselect({
									message: `${existingFiles.length} file(s) already exist. Select which to overwrite (space to toggle, enter to confirm).`,
									options: existingFiles.map((f) => ({ value: f.relPath, label: f.relPath })),
									initialValues: existingFiles.map((f) => f.relPath),
									required: false,
								}),
							),
						)
			const envKeyConflicts = envConflicts(cwd, envKeys, setup)
			const overwriteEnv =
				force ||
				(envKeyConflicts.length > 0 &&
					!yes &&
					orCancel(await p.confirm({ message: `Overwrite existing .env values (${envKeyConflicts.join(", ")})?`, initialValue: true })))

			// ── Review, then confirm ──────────────────────────────────────────────────────────────────
			summaryNote([
				["Template", entry.label],
				["Package manager", pm],
				["Kizlo directory", setup.dir],
				["Import alias", setup.alias || "relative imports"],
				["API URL", setup.baseUrl || "fill in .env later"],
				["WordPress", setup.mode === "local" ? "Local" : "Remote"],
				["Examples", includeExamples ? "Yes" : "No"],
			])
			if (!yes && !(await confirmProceed(FINAL_CONFIRMATION_TEXT))) {
				fetchedRegistry.cleanup()
				p.cancel("Setup cancelled.")
				process.exit(0)
			}

			// ── Execute as a checklist ──────────────────────────────────────────────────────────────────
			if (shouldPersistPm) persistPackageManagerField(cwd, pm)
			const warnings: string[] = []
			if (droppedAlias)
				warnings.push(
					`No tsconfig path maps \`${droppedAlias}\` onto ${dirRel}, so relative imports were written instead. Add \`"${droppedAlias}*": ["./${hasSrcDir ? "src/" : ""}*"]\` to your tsconfig \`paths\` and re-run to use the alias.`,
				)
			const scaffolded: { file: ScaffoldFile; result: ScaffoldResult }[] = []
			let gitignore: ReturnType<typeof ensureGitignored> = "present"
			const kizloSpec = `kizlo@${manifest.dependencies?.kizlo ?? `^${getVersion()}`}`

			const aborted = await runChecklist([
				{
					title: `Installing kizlo with ${pm}`,
					enabled: !hasKizlo,
					run: async () => {
						if (await runCommandAsync(addDependencyArgs(pm, kizloSpec), cwd, "ignore")) return "Installed kizlo"
						// Non-fatal: the rest of the wiring still runs; the user finishes by installing it themselves.
						warnings.push(`Install it yourself: ${addDependencyArgs(pm, kizloSpec).join(" ")}`)
						throw new StepError("Could not install kizlo automatically", { fatal: false })
					},
				},
				{
					title: "Aligning dependencies",
					run: (message) => alignDependencies(cwd, pm, pkg, manifest, message, warnings),
				},
				{
					title: "Setting up local WordPress (first run downloads images, this can take a while)",
					enabled: setup.mode === "local",
					run: async () => {
						try {
							const warning = await provisionLocalWordPress(cwd, setup)
							if (warning) warnings.push(warning)
							return "Local WordPress ready"
						} catch (error) {
							throw new StepError("Local WordPress setup failed", { detail: error instanceof Error ? error.message : String(error) })
						}
					},
				},
				{
					title: "Writing environment files",
					run: () => writeEnv(cwd, envKeys, setup, { overwrite: overwriteEnv, exampleTemplate: readEnvExample(entry.dir) }),
				},
				{
					title: "Syncing settings to WordPress",
					enabled: setup.mode === "remote" && Boolean(setup.wpUrl && setup.wpUsername && setup.wpPassword),
					run: async () => {
						warnings.push(...(await syncRemote(setup)))
						return "Synced settings to WordPress"
					},
				},
				{
					title: "Scaffolding Kizlo files",
					run: async () => {
						for (const file of files)
							scaffolded.push({ file, result: await scaffoldFile(cwd, file, { force: overwritePaths.has(file.relPath), yes: true }) })
						writeGeneratedContract(cwd, serverDirRel)
						gitignore = ensureGitignored(cwd, ".env")
						ensureGitignored(cwd, ".kizlo/")
						const written = scaffolded.filter(({ result }) => result !== "kept").length
						return `Scaffolded ${written} file${written === 1 ? "" : "s"}`
					},
				},
			])

			if (aborted) {
				p.cancel("Setup failed — see the errors above.")
				process.exit(1)
			}

			// ── Report the details the checklist elided, plus manual steps a spinner couldn't render ────
			for (const warning of warnings) p.log.warn(warning)
			for (const { file, result } of scaffolded) reportScaffold(file, result, yes)

			applyProjectPatches(cwd, patchEntries(changesFor(manifest, "init")), manifest.config, scaffold)

			for (const note of manifest.init.notes) {
				const rendered = renderNote(note, setup.alias)
				printManualStep(rendered.title, rendered.body)
			}

			if (gitignore !== "present") p.log.success(`${gitignore === "created" ? "Created" : "Updated"} .gitignore (ignoring .env)`)

			nextStepsNote(setup)

			p.outro("Kizlo is ready 🎉")
		} finally {
			fetchedRegistry.cleanup()
		}
	},
})
