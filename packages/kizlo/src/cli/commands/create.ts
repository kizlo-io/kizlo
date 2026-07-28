import fs from "node:fs"
import path from "node:path"
import * as p from "@clack/prompts"
import { defineCommand } from "citty"
import z from "zod/v4"
import { fetchRegistry, listTemplates, resolveRegistry, type TemplateEntry } from "../presets/source"
import {
	adaptFile,
	changesFor,
	fileEntries,
	minCliError,
	patchEntries,
	readManifest,
	resolveDependencies,
	type TemplateManifest,
} from "../presets/template"
import {
	availablePackageManagers,
	detectInvokingPackageManager,
	ensureGitignored,
	frameworkCreateArgs,
	installArgs,
	type PackageManager,
	runCommandAsync,
	runCommandCaptured,
} from "../utils"
import {
	collectConnectionInteractively,
	nextStepsLines,
	orCancel,
	pickAppPort,
	readEnvExample,
	resolveEnvKeys,
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
	scaffoldFile,
	writeGeneratedContract,
} from "./_wiring"

/** The final path segment of a project name — the app folder itself; everything before it is where it lands. */
function folderSegment(value: string): string {
	const segments = value.replace(/\\/g, "/").split("/").filter(Boolean)
	return segments[segments.length - 1] ?? ""
}

/**
 * Tidy the entered name/path for both the target dir and the display: trim, drop a leading `./`, and drop a
 * trailing separator, so `cd`, the spinner, and the warning lines read as `templates/my-app`, not
 * `./templates/my-app/`. Preserves `../` and absolute paths (only a leading `./` is redundant).
 */
export function normalizeProjectName(value: string): string {
	return value
		.trim()
		.replace(/^\.\/+/, "")
		.replace(/[/\\]+$/, "")
}

/**
 * A project name may be a bare folder (`my-app`) or a path to scaffold somewhere other than the current
 * dir — relative (`apps/my-app`, `../my-app`) or absolute (`/srv/my-app`). Only the last segment is the
 * app folder, so that's what's validated as a name; the parent dirs (which may not exist yet) are created
 * by the framework's own CLI. `.`/`..` as the final segment, or a name with no real segment, is rejected.
 */
const projectNameSchema = z
	.string()
	.trim()
	.min(1, "Required")
	.refine((value) => {
		const base = folderSegment(value)
		return base.length > 0 && base !== "." && base !== ".." && /^[A-Za-z0-9._-]+$/.test(base)
	}, "The app folder (last path segment) can only contain letters, numbers, dots, and dashes")
export const projectName = validate(projectNameSchema)

/** Package managers `create` can wire the getting-started steps for, in display order. */
const PACKAGE_MANAGERS: readonly PackageManager[] = ["pnpm", "npm", "yarn", "bun"]

/**
 * Pin Kizlo's dependencies in the freshly bootstrapped `package.json`. The template is authoritative
 * for the versions (its manifest's `dependencies`/`devDependencies`, stamped at release), falling back
 * to the running CLI's version for `kizlo` in-repo before the first stamp. The deps are only recorded,
 * not installed — the getting-started note tells the user to run install.
 */
function recordDependencies(dir: string, manifest: TemplateManifest): void {
	const pkgPath = path.join(dir, "package.json")
	const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
		dependencies?: Record<string, string>
		devDependencies?: Record<string, string>
	}
	const { dependencies, devDependencies } = resolveDependencies(manifest)
	pkg.dependencies = sortDependencies({ ...pkg.dependencies, ...dependencies })
	if (Object.keys(devDependencies).length) pkg.devDependencies = sortDependencies({ ...pkg.devDependencies, ...devDependencies })
	fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, "\t")}\n`)
}

/**
 * Alphabetize a dependency map by package name. The framework CLI writes its deps sorted, but merging
 * Kizlo's pins on top appends them out of order — sherif flags unsorted dependency keys, so re-sort the
 * whole map before writing.
 */
function sortDependencies(deps: Record<string, string>): Record<string, string> {
	return Object.fromEntries(Object.entries(deps).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

/**
 * The argv `create` runs to bootstrap a fresh base app with the framework's own official CLI, built
 * from the template manifest's `bootstrap` (initializer + flags) — the template is the single source
 * of truth for the framework. The CLI owns only the package-manager mechanics: {@link frameworkCreateArgs}
 * assembles the `<pm> create …` invocation, and the `{{pm}}` token in the flags is substituted with the
 * chosen manager (e.g. `--use-{{pm}}` → `--use-pnpm`).
 */
export function bootstrapArgs(manifest: TemplateManifest, pm: PackageManager, name: string): string[] | undefined {
	if (!manifest.bootstrap) return undefined
	const flags = manifest.bootstrap.flags.map((flag) => flag.replaceAll("{{pm}}", pm))
	return frameworkCreateArgs(pm, manifest.bootstrap.initializer, name, flags)
}

/**
 * Layer Kizlo's wiring onto a freshly bootstrapped app in `dir`, from an already-fetched template
 * directory + manifest. The framework CLI has produced the base project (package.json, config,
 * tsconfig, the root layout); this drives the manifest — the same engine `init` uses — to record the
 * `kizlo` dependency, write `kizlo.config.ts`, scaffold the manifest's files (core wiring from `base`
 * and `create` always, the `example`-flagged demo pages only when `includeExamples`),
 * seed the generated contract, and ignore `.env` and the `.kizlo/` working dir (which holds the local WordPress install). On a fresh app Kizlo owns the layout, so `create`
 * writes it whole (already SEO-wired) rather than patching — `applyLayoutPatches` runs over `create`'s
 * patches, which are none today. The target directory layout comes straight from the manifest's
 * conventions, which the bootstrap flags are chosen to match, so files land where they expect. Fresh
 * files are written with `force`, silently replacing the framework defaults.
 */
export async function applyManifestWiring(
	dir: string,
	templateDir: string,
	manifest: TemplateManifest,
	opts: { includeExamples?: boolean; localDev?: boolean },
): Promise<void> {
	const { kizloDir, appDir, alias } = manifest.conventions
	const scaffold = buildScaffoldContext(dir, { dirRel: kizloDir, appDir, alias, clientUrl: undefined })

	recordDependencies(dir, manifest)

	const changes = changesFor(manifest, "create", { includeExamples: opts.includeExamples })
	const files = [
		{ label: "Kizlo config", relPath: "kizlo.config.ts", contents: kizloConfigTemplate(kizloDir, alias, opts.localDev) },
		...fileEntries(changes).map((entry) => adaptFile(templateDir, entry, manifest.conventions, scaffold)),
	]
	for (const file of files) reportScaffold(file, await scaffoldFile(dir, file, { force: true, yes: false }), false)

	writeGeneratedContract(dir, path.join(kizloDir, "server"))
	ensureGitignored(dir, ".env")
	ensureGitignored(dir, ".kizlo/")

	applyLayoutPatches(dir, patchEntries(changes), manifest.conventions, scaffold)
}

export const create = defineCommand({
	meta: {
		name: "create",
		description: "Scaffold a new project with Kizlo already wired",
	},
	args: {
		template: {
			type: "positional",
			required: false,
			description: "Template to scaffold from (discovered from the registry)",
		},
		name: {
			type: "positional",
			required: false,
			description: "Project folder to create — a bare name or a path (e.g. apps/my-app, ../my-app, /srv/my-app)",
		},
		source: {
			type: "string",
			description:
				"Where to scaffold from — a local dir or giget source, either a registry of templates or a single template (default: Kizlo's GitHub templates)",
		},
	},
	async run({ args }) {
		const cwd = process.cwd()

		p.intro(`Let's create a new Kizlo application`)

		const registry = resolveRegistry(args.source ? String(args.source) : undefined)
		let fetchedRegistry: Awaited<ReturnType<typeof fetchRegistry>>
		try {
			fetchedRegistry = await fetchRegistry(registry)
		} catch (error) {
			p.cancel(error instanceof Error ? error.message : String(error))
			process.exit(1)
		}

		const templates = listTemplates(fetchedRegistry.dir)
		if (templates.length === 0) {
			fetchedRegistry.cleanup()
			p.cancel(`No templates found in the registry (${registry.source}). Each template needs a template.json.`)
			process.exit(1)
		}

		const cancelFrom = (message: string): never => {
			fetchedRegistry.cleanup()
			p.cancel(message)
			process.exit(1)
		}

		const requested = args.template as string | undefined
		let selected: TemplateEntry | undefined
		if (requested) {
			selected = templates.find((entry) => entry.id === requested)
			if (!selected) return cancelFrom(`Unknown template "${requested}". Available: ${templates.map((entry) => entry.id).join(", ")}`)
		} else {
			const id = orCancel(
				await p.select({
					message: "Template",
					options: templates.map((entry) => ({ value: entry.id, label: entry.label })),
				}),
			)
			selected = templates.find((entry) => entry.id === id)
		}
		if (!selected) return cancelFrom("No template selected.")
		const template = selected.id
		const templateDir = selected.dir
		const label = selected.label
		const fail = cancelFrom

		// Read the manifest up front so its data (`apiPath`, `minCli`, `bootstrap`) drives the run — the CLI
		// hardcodes nothing framework-specific; every template, including a community one, works the same.
		const manifest = readManifest(templateDir)
		const minErr = minCliError(manifest)
		if (minErr) return fail(minErr)

		const name = normalizeProjectName(
			args.name
				? String(args.name)
				: orCancel(await p.text({ message: "What is your project named?", placeholder: "my-app", validate: projectName })),
		)
		const invalid = projectName(name)
		if (invalid) {
			p.cancel(invalid)
			process.exit(1)
		}

		const dir = path.resolve(cwd, name)
		if (fs.existsSync(dir)) return cancelFrom(`${name} already exists — pick a different name or remove it.`)

		const installed = availablePackageManagers(PACKAGE_MANAGERS)
		const invokingPm = detectInvokingPackageManager()
		const defaultPm = invokingPm && installed.includes(invokingPm) ? invokingPm : installed[0]
		const pm = orCancel(
			await p.select<PackageManager>({
				message: "Package manager",
				options: installed.map((id) => ({ value: id, label: id })),
				initialValue: defaultPm,
			}),
		)

		const conn = await collectConnectionInteractively(manifest.apiPath, { baseUrl: `http://localhost:${await pickAppPort()}` })
		if (manifest.apiPath && conn.baseUrl) conn.baseUrl = withApiPath(conn.baseUrl, manifest.apiPath)

		const includeExamples = orCancel(await p.confirm({ message: "Add examples?", initialValue: true }))

		const bootstrap = bootstrapArgs(manifest, pm, name)
		if (!bootstrap) return fail(`Template "${template}" can't be scaffolded — its manifest declares no framework bootstrap.`)

		const s = p.spinner()
		s.start(`Creating ${name} with the ${label} CLI`)
		const scaffold = runCommandCaptured(bootstrap, cwd)
		s.stop(scaffold.ok ? `Created ${name} with the ${label} CLI` : `${label} setup failed`)
		if (!scaffold.ok) {
			if (scaffold.output) p.log.error(scaffold.output)
			fail(`${label} setup failed — see the output above and try again.`)
		}

		const exampleTemplate = readEnvExample(templateDir)

		try {
			await applyManifestWiring(dir, templateDir, manifest, { includeExamples, localDev: conn.mode === "local" })
		} catch (error) {
			fail(error instanceof Error ? error.message : String(error))
		}
		fetchedRegistry.cleanup()

		let depsInstalled = false
		if (orCancel(await p.confirm({ message: "Install dependencies now?", initialValue: true }))) {
			const is = p.spinner()
			is.start(`Installing dependencies with ${pm}`)
			depsInstalled = await runCommandAsync(installArgs(pm), dir, "ignore")
			is.stop(depsInstalled ? "Installed dependencies" : "Could not install dependencies")
			if (!depsInstalled) p.log.warn(`Install them yourself: cd ${name} && ${installArgs(pm).join(" ")}`)
		}

		await setupLocalWordPress(dir, conn)
		await writeEnv(dir, resolveEnvKeys(manifest), conn, { force: true, yes: false, exampleTemplate })
		await syncRemote(conn)

		p.note([`cd ${name}`, ...(depsInstalled ? [] : [`${pm} install`]), ``, ...nextStepsLines(conn)].join("\n"), "Next steps")

		p.outro("Kizlo is ready 🎉")
	},
})
