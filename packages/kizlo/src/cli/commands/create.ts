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
	approveBuildsCommand,
	cleanupWorkspaceArtifacts,
	detectInvokingPackageManager,
	detectPackageManager,
	ensureGitignored,
	findWorkspaceRoot,
	initGitRepository,
	installArgs,
	isCommandAvailable,
	isGitRepository,
	isWorkspaceMember,
	type PackageManager,
	runCommandCapturedAsync,
	tokenizeCommand,
} from "../utils"
import {
	collectConnectionFromEnv,
	collectConnectionInteractively,
	collectTemplatePrompts,
	nextStepsLines,
	orCancel,
	pickAppPort,
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
import { applyProjectPatches, buildScaffoldContext, kizloConfigTemplate, scaffoldFile, writeGeneratedContract } from "./_wiring"

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
 * How a chosen name is shown back to the user. A bare folder is displayed as `./my-app` so it's obvious it
 * lands in the current dir; a name that's already a path (relative `apps/my-app`, `../my-app`, or an
 * absolute path) is shown as-is. Display only — the stored name stays normalized (no leading `./`).
 */
export function displayProjectName(value: string): string {
	return /[/\\]/.test(value) ? value : `./${value}`
}

const NAME_ADJECTIVES = [
	"amber",
	"brave",
	"calm",
	"clever",
	"cosmic",
	"eager",
	"fancy",
	"gentle",
	"happy",
	"jolly",
	"keen",
	"lively",
	"lucky",
	"mellow",
	"nimble",
	"plucky",
	"quiet",
	"rapid",
	"shiny",
	"smooth",
	"sunny",
	"swift",
	"witty",
	"zesty",
]
const NAME_NOUNS = [
	"otter",
	"falcon",
	"maple",
	"comet",
	"harbor",
	"pixel",
	"willow",
	"ember",
	"meadow",
	"cactus",
	"lotus",
	"badger",
	"cobra",
	"gecko",
	"heron",
	"koala",
	"lemur",
	"marble",
	"nebula",
	"onyx",
	"quartz",
	"raven",
	"tulip",
	"wren",
]

/**
 * A throwaway two-word name (`brave-otter`) used as the name prompt's placeholder and default. We
 * generate it from small curated word lists rather than pulling in a name-generator dependency: it's
 * only a placeholder, and every combination is a valid folder name that satisfies `projectNameSchema`.
 * The default is deliberately not the current directory's name — an empty submit should scaffold into a
 * fresh subdirectory, never the current dir (entering `.` is the explicit opt-in for that).
 */
export function randomProjectName(): string {
	const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)] as T
	return `${pick(NAME_ADJECTIVES)}-${pick(NAME_NOUNS)}`
}

// Entries that don't count as "occupied" when scaffolding into `.`: a repo the user git-init'd first, and
// macOS's directory cruft. Everything else means the directory already holds real files.
const SCAFFOLD_IGNORED_ENTRIES = new Set([".git", ".DS_Store"])

/**
 * Whether `dir` is empty enough to scaffold into with `.` — nothing but the benign entries above. Used to
 * reject scaffolding over a non-empty current directory before the framework CLI runs (it would refuse
 * anyway, but this gives a clear Kizlo-level message instead of the CLI's).
 */
export function isDirScaffoldable(dir: string): boolean {
	return fs.readdirSync(dir).every((entry) => SCAFFOLD_IGNORED_ENTRIES.has(entry))
}

/**
 * A project name may be a bare folder (`my-app`), a path to scaffold somewhere other than the current
 * dir — relative (`apps/my-app`, `../my-app`) or absolute (`/srv/my-app`) — or a lone `.` to scaffold
 * into the current directory itself. Only the last segment is the app folder, so that's what's validated
 * as a name; the parent dirs (which may not exist yet) are created by the framework's own CLI. `.`/`..`
 * as the final segment of a longer path, or a name with no real segment, is rejected.
 */
const projectNameSchema = z
	.string()
	.trim()
	.min(1, "Required")
	.refine((value) => {
		// A lone `.` is the explicit "use the current directory" opt-in.
		if (value === ".") return true
		const base = folderSegment(value)
		return base.length > 0 && base !== "." && base !== ".." && /^[A-Za-z0-9._-]+$/.test(base)
	}, "The app folder (last path segment) can only contain letters, numbers, dots, and dashes")
export const projectName = validate(projectNameSchema)

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
 * Each manager's command to download-and-run a package (npm's `create` mangles a name into `create-*`, so
 * a plain CLI like `@tanstack/cli` must go through exec instead). Substituted for the `{{dlx}}` token.
 */
const DLX_COMMAND: Record<PackageManager, string> = {
	pnpm: "pnpm dlx",
	yarn: "yarn dlx",
	npm: "npx",
	bun: "bunx",
}

/**
 * The argv `create` runs to bootstrap a fresh base app with the framework's own official CLI, built from
 * the template manifest's `bootstrap` command — the template is the single source of truth for the whole
 * invocation. The CLI imposes no shape: it substitutes the `{{dlx}}` (the manager's exec command),
 * `{{pm}}` (chosen manager), and `{{name}}` (project name) tokens, plus a `{{token}}` for every declared
 * prompt (from `promptArgs`), then tokenizes the result into argv. A prompt fragment may be empty (drops
 * out when tokenized) or several flags. `undefined` when the manifest declares no bootstrap (an
 * `init`-only template).
 */
export function bootstrapArgs(
	manifest: TemplateManifest,
	pm: PackageManager,
	name: string,
	promptArgs: Record<string, string> = {},
): string[] | undefined {
	if (!manifest.create) return undefined
	let command = manifest.create.command.replaceAll("{{dlx}}", DLX_COMMAND[pm]).replaceAll("{{pm}}", pm).replaceAll("{{name}}", name)
	for (const [token, fragment] of Object.entries(promptArgs)) command = command.replaceAll(`{{${token}}}`, fragment)
	return tokenizeCommand(command)
}

/**
 * Layer Kizlo's wiring onto a freshly bootstrapped app in `dir`, from an already-fetched template
 * directory + manifest. The framework CLI has produced the base project (package.json, config,
 * tsconfig, the root layout); this drives the manifest — the same engine `init` uses — to record the
 * `kizlo` dependency, write `kizlo.config.ts`, scaffold the manifest's files (core wiring from `base`
 * and `create` always, the `example`-flagged demo pages only when `includeExamples`),
 * seed the generated contract, and ignore `.env` and the `.kizlo/` working dir (which holds the local WordPress install). On a fresh app Kizlo owns the layout, so `create`
 * writes it whole (already SEO-wired) rather than patching — `applyProjectPatches` runs over `create`'s
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
	const { alias, kizloPath } = manifest.config
	const hasSrcDir = fs.existsSync(path.join(dir, "src"))
	const scaffold = buildScaffoldContext(dir, { dirRel: kizloPath, hasSrcDir, alias, clientUrl: undefined })

	recordDependencies(dir, manifest)

	const changes = changesFor(manifest, "create", { includeExamples: opts.includeExamples })
	const files = [
		{ label: "Kizlo config", relPath: "kizlo.config.ts", contents: kizloConfigTemplate(kizloPath, alias, opts.localDev) },
		...fileEntries(changes).map((entry) => adaptFile(templateDir, entry, manifest.config, scaffold)),
	]
	for (const file of files) await scaffoldFile(dir, file, { force: true, yes: false })

	writeGeneratedContract(dir, path.join(kizloPath, "server"))
	ensureGitignored(dir, ".env")
	ensureGitignored(dir, ".kizlo/")

	applyProjectPatches(dir, patchEntries(changes), manifest.config, scaffold)
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
		yes: {
			type: "boolean",
			alias: "y",
			description: "Skip prompts and scaffold with defaults (non-interactive); requires the template and name",
			default: false,
		},
		source: {
			type: "string",
			description:
				"Where to scaffold from — a local dir or giget source, either a registry of templates or a single template (default: Kizlo's GitHub templates)",
		},
	},
	async run({ args }) {
		const yes = Boolean(args.yes)
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
		const fail = cancelFrom

		const requested = args.template as string | undefined
		let selected: TemplateEntry | undefined
		if (requested) {
			selected = templates.find((entry) => entry.id === requested)
			if (!selected) return cancelFrom(`Unknown template "${requested}". Available: ${templates.map((entry) => entry.id).join(", ")}`)
		} else if (yes) {
			return cancelFrom(
				`--yes needs a template: kizlo create <template> <name> --yes (available: ${templates.map((e) => e.id).join(", ")})`,
			)
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

		const manifest = readManifest(templateDir)
		const minErr = minCliError(manifest)
		if (minErr) return fail(minErr)

		if (yes && !args.name) return cancelFrom("--yes needs a project name: kizlo create <template> <name> --yes")
		const defaultName = randomProjectName()
		const name = normalizeProjectName(
			args.name
				? String(args.name)
				: orCancel(
						await p.text({
							message: `What is your project named? (enter for "${displayProjectName(defaultName)}", or "." for the current directory)`,
							placeholder: displayProjectName(defaultName),
							// The `./`-form so an empty submit echoes `./name`; normalizeProjectName strips it back off.
							defaultValue: displayProjectName(defaultName),
							validate: (value) => (value ? projectName(value) : undefined),
						}),
					),
		)
		const invalid = projectName(name)
		if (invalid) return cancelFrom(invalid)

		const inCurrentDir = name === "."
		const displayName = inCurrentDir ? "current directory" : displayProjectName(name)
		const dir = inCurrentDir ? cwd : path.resolve(cwd, name)
		if (!inCurrentDir && fs.existsSync(dir)) return cancelFrom(`${name} already exists — pick a different name or remove it.`)

		if (inCurrentDir && !isDirScaffoldable(cwd)) {
			if (yes) return cancelFrom("The current directory isn't empty — scaffold into an empty directory, or pass a name instead of `.`.")
			p.log.warn("The current directory isn't empty — scaffolding here may overwrite or conflict with existing files.")
			if (!orCancel(await p.confirm({ message: "Scaffold into it anyway?", initialValue: false }))) {
				fetchedRegistry.cleanup()
				p.cancel("Setup cancelled.")
				process.exit(0)
			}
		}

		const parentDir = path.dirname(dir)
		const workspace = findWorkspaceRoot(parentDir)
		const detectedPm = await detectPackageManager(workspace?.root ?? parentDir)
		const pm = detectedPm ?? (yes ? (detectInvokingPackageManager() ?? "npm") : await selectPackageManager("Package manager"))

		const templatePrompts = await collectTemplatePrompts(manifest, { yes })

		const baseUrl = `http://localhost:${await pickAppPort()}`
		const conn = yes
			? collectConnectionFromEnv(resolveEnvKeys(manifest))
			: await collectConnectionInteractively(manifest.config.apiPath, { baseUrl })
		if (yes && !conn.baseUrl) conn.baseUrl = baseUrl
		if (manifest.config.apiPath && conn.baseUrl) conn.baseUrl = withApiPath(conn.baseUrl, manifest.config.apiPath)

		const includeExamples = yes ? true : orCancel(await p.confirm({ message: "Add examples?", initialValue: true }))
		const installDeps = yes ? true : orCancel(await p.confirm({ message: "Install dependencies now?", initialValue: true }))

		const canGit = isCommandAvailable("git") && !workspace && !isGitRepository(cwd)
		const initGit = canGit && (yes || orCancel(await p.confirm({ message: "Initialize a git repository?", initialValue: true })))

		const bootstrap = bootstrapArgs(manifest, pm, name, templatePrompts.args)
		if (!bootstrap) return fail(`Template "${template}" can't be scaffolded — its manifest declares no framework bootstrap.`)

		summaryNote([
			["Template", label],
			...templatePrompts.rows,
			[inCurrentDir || /[/\\]/.test(name) ? "Location" : "Project", displayName],
			["Package manager", `${pm}${detectedPm ? " (detected)" : ""}`],
			["API URL", conn.baseUrl],
			["WordPress", conn.mode === "local" ? "Local" : "Remote"],
			["Examples", includeExamples ? "Yes" : "No"],
			["Install dependencies", installDeps ? "Yes" : "No"],
			...(canGit ? ([["Git repository", initGit ? "Yes" : "No"]] as [string, string][]) : []),
		])
		if (!yes && !(await confirmProceed(FINAL_CONFIRMATION_TEXT))) {
			fetchedRegistry.cleanup()
			p.cancel("Setup cancelled.")
			process.exit(0)
		}

		const exampleTemplate = readEnvExample(templateDir)
		const warnings: string[] = []
		const result: { depsInstalled: boolean; approveBuilds?: string } = { depsInstalled: false }

		const aborted = await runChecklist([
			{
				title: inCurrentDir ? `Scaffolding into the current directory with the ${label} CLI` : `Creating ${name} with the ${label} CLI`,
				run: async () => {
					const scaffold = await runCommandCapturedAsync(bootstrap, cwd)
					if (!scaffold.ok) throw new StepError(`${label} setup failed`, { detail: scaffold.output || undefined })
					return inCurrentDir ? `Scaffolded into the current directory with the ${label} CLI` : `Created ${name} with the ${label} CLI`
				},
			},
			{
				title: "Wiring Kizlo into the project",
				run: async () => {
					await applyManifestWiring(dir, templateDir, manifest, { includeExamples, localDev: conn.mode === "local" })
					return "Wired Kizlo into the project"
				},
			},
			{
				title: "Setting up local WordPress (first run downloads images, this can take a while)",
				enabled: conn.mode === "local",
				run: async () => {
					try {
						const warning = await provisionLocalWordPress(dir, conn)
						if (warning) warnings.push(warning)
						return "Local WordPress ready"
					} catch (error) {
						throw new StepError("Local WordPress setup failed", { detail: error instanceof Error ? error.message : String(error) })
					}
				},
			},
			{
				title: "Writing environment files",
				run: () => writeEnv(dir, resolveEnvKeys(manifest), conn, { overwrite: true, exampleTemplate }),
			},
			{
				title: "Syncing settings to WordPress",
				enabled: conn.mode === "remote" && Boolean(conn.wpUrl && conn.wpUsername && conn.wpPassword),
				run: async () => {
					warnings.push(...(await syncRemote(conn)))
					return "Synced settings to WordPress"
				},
			},
			{
				title: "Initializing git repository",
				enabled: initGit,
				run: () => {
					if (!initGitRepository(dir)) throw new StepError("Could not initialize a git repository", { fatal: false })
					return "Initialized git repository"
				},
			},
			{
				title: `Installing dependencies with ${pm}`,
				enabled: installDeps,
				run: async () => {
					const member = workspace ? isWorkspaceMember(workspace, dir) : false
					if (member && workspace) cleanupWorkspaceArtifacts(dir)
					const installCwd = member && workspace ? workspace.root : dir
					const install = await runCommandCapturedAsync(installArgs(pm), installCwd)
					result.depsInstalled = install.ok
					if (!install.ok) throw new StepError("Could not install dependencies", { detail: install.output || undefined, fatal: false })
					result.approveBuilds = approveBuildsCommand(pm, install.output)
					return "Installed dependencies"
				},
			},
		])

		fetchedRegistry.cleanup()
		if (aborted) {
			p.cancel("Setup failed — see the errors above.")
			process.exit(1)
		}

		for (const warning of warnings) p.log.warn(warning)

		p.note(
			[
				...(inCurrentDir ? [] : [`cd ${name}`]),
				...(result.depsInstalled ? [] : [`${pm} install`]),
				...(result.approveBuilds ? [result.approveBuilds] : []),
				``,
				...nextStepsLines(conn),
			].join("\n"),
			"Next steps",
		)

		p.outro("Kizlo is ready 🎉")
	},
})
