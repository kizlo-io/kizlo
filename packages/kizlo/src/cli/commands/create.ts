import fs from "node:fs"
import path from "node:path"
import * as p from "@clack/prompts"
import { defineCommand } from "citty"
import z from "zod/v4"
import { printBanner } from "../banner"
import { getPreset } from "../presets"
import { fetchTemplate } from "../presets/source"
import { adaptOwnFile, ownEntries, readManifest, type TemplateManifest } from "../presets/template"
import {
	availablePackageManagers,
	detectInvokingPackageManager,
	ensureGitignored,
	frameworkCreateArgs,
	getVersion,
	installArgs,
	type PackageManager,
	runCommandAsync,
	runCommandCaptured,
} from "../utils"
import { dockerAvailable } from "../wp/docker"
import {
	collectConnectionInteractively,
	nextStepsLines,
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
	scaffoldFile,
	writeGeneratedContract,
} from "./_wiring"

/**
 * The templates `create` can scaffold from. Each id is both the `templates/<id>` folder and the
 * preset that drives its WordPress setup and framework bootstrap.
 */
const TEMPLATES = ["nextjs"] as const
type TemplateId = (typeof TEMPLATES)[number]

function isTemplate(value: string): value is TemplateId {
	return (TEMPLATES as readonly string[]).includes(value)
}

const projectNameSchema = z
	.string()
	.trim()
	.min(1, "Required")
	.refine(
		(value) => !value.startsWith(".") && !value.includes("/") && !value.includes("\\"),
		"Enter a folder name (letters, numbers, dashes)",
	)
const projectName = validate(projectNameSchema)

/** Package managers `create` can wire the getting-started steps for, in display order. */
const PACKAGE_MANAGERS: readonly PackageManager[] = ["pnpm", "npm", "yarn", "bun"]

/**
 * Pin the `kizlo` dependency in the freshly bootstrapped `package.json`. The template is
 * authoritative for the version (`kizloVersion` in its manifest, stamped at release), falling back to
 * the running CLI's version in-repo before the first stamp. The dependency is only recorded, not
 * installed — the getting-started note tells the user to run install.
 */
function recordKizloDependency(dir: string, manifest: TemplateManifest): void {
	const pkgPath = path.join(dir, "package.json")
	const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { dependencies?: Record<string, string> }
	pkg.dependencies ??= {}
	pkg.dependencies.kizlo = manifest.kizloVersion ?? `^${getVersion()}`
	fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, "\t")}\n`)
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
 * `kizlo` dependency, write `kizlo.config.ts`, scaffold the manifest's own files (wiring plus the demo
 * starter pages), seed the generated contract, ignore `.env`, and patch the root layout's SEO exports.
 * The target directory layout comes straight from the manifest tokens, which the bootstrap flags are
 * chosen to match, so files land where the manifest expects. Fresh files are written with `force`,
 * silently replacing the framework defaults.
 */
export async function applyManifestWiring(
	dir: string,
	templateDir: string,
	manifest: TemplateManifest,
	opts: { devPath?: string; includeStarter?: boolean },
): Promise<void> {
	const { kizloDir, appDir, alias } = manifest.tokens
	const scaffold = buildScaffoldContext(dir, { dirRel: kizloDir, appDir, alias, clientUrl: undefined })

	recordKizloDependency(dir, manifest)

	const files = [
		{ label: "Kizlo config", relPath: "kizlo.config.ts", contents: kizloConfigTemplate(kizloDir, alias, opts.devPath) },
		...ownEntries(manifest, { includeStarter: opts.includeStarter }).map((entry) =>
			adaptOwnFile(templateDir, entry, manifest.tokens, scaffold),
		),
	]
	for (const file of files) reportScaffold(file, await scaffoldFile(dir, file, { force: true, yes: false }), false)

	writeGeneratedContract(dir, path.join(kizloDir, "server"))
	ensureGitignored(dir, ".env")
	applyLayoutPatches(dir, manifest, scaffold)
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
			description: `Template to scaffold from (${TEMPLATES.join(", ")})`,
		},
		name: {
			type: "positional",
			required: false,
			description: "Project folder to create",
		},
	},
	async run({ args }) {
		const cwd = process.cwd()

		printBanner(getVersion())
		p.intro("kizlo create")

		const requested = args.template as string | undefined
		let template: TemplateId
		if (requested) {
			if (!isTemplate(requested)) {
				p.cancel(`Unknown template "${requested}". Available: ${TEMPLATES.join(", ")}`)
				process.exit(1)
			}
			template = requested
		} else {
			template = orCancel(
				await p.select({
					message: "Template",
					options: TEMPLATES.map((id) => ({ value: id, label: id })),
				}),
			)
		}

		const name = args.name
			? String(args.name).trim()
			: orCancel(await p.text({ message: "Project name", placeholder: "my-app", validate: projectName }))
		if (!args.name) {
			const check = projectName(name)
			if (check) {
				p.cancel(check)
				process.exit(1)
			}
		}

		const dir = path.resolve(cwd, name)
		if (fs.existsSync(dir)) {
			p.cancel(`${name} already exists — pick a different name or remove it.`)
			process.exit(1)
		}

		const preset = getPreset(template)
		if (!preset) {
			p.cancel(`No preset for template "${template}".`)
			process.exit(1)
		}

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

		const includeStarter = orCancel(await p.confirm({ message: "Add example pages?", initialValue: true }))

		const conn = await collectConnectionInteractively(preset)
		if (preset.apiPath && conn.baseUrl) conn.baseUrl = withApiPath(conn.baseUrl, preset.apiPath)

		if (conn.mode === "local" && !(await dockerAvailable())) {
			p.cancel("Docker isn't available — start Docker (or install it) and re-run, or choose “Use my own WordPress”.")
			process.exit(1)
		}

		const fetched = await fetchTemplate(template)
		const fail = (message: string): never => {
			fetched.cleanup()
			p.cancel(message)
			process.exit(1)
		}

		const manifest = readManifest(fetched.dir)
		const bootstrap = bootstrapArgs(manifest, pm, name)
		if (!bootstrap) {
			fetched.cleanup()
			p.cancel(`Template "${template}" can't be scaffolded — its manifest declares no framework bootstrap.`)
			process.exit(1)
		}

		const s = p.spinner()
		s.start(`Creating ${name} with the ${preset.label} CLI`)
		const scaffold = runCommandCaptured(bootstrap, cwd)
		s.stop(scaffold.ok ? `Created ${name} with the ${preset.label} CLI` : `${preset.label} setup failed`)
		if (!scaffold.ok) {
			if (scaffold.output) p.log.error(scaffold.output)
			fail(`${preset.label} setup failed — see the output above and try again.`)
		}

		try {
			await applyManifestWiring(dir, fetched.dir, manifest, { devPath: conn.devPath, includeStarter })
		} catch (error) {
			fail(error instanceof Error ? error.message : String(error))
		}
		fetched.cleanup()

		let depsInstalled = false
		if (orCancel(await p.confirm({ message: "Install dependencies now?", initialValue: true }))) {
			const is = p.spinner()
			is.start(`Installing dependencies with ${pm}`)
			depsInstalled = await runCommandAsync(installArgs(pm), dir, "ignore")
			is.stop(depsInstalled ? "Installed dependencies" : "Could not install dependencies")
			if (!depsInstalled) p.log.warn(`Install them yourself: cd ${name} && ${installArgs(pm).join(" ")}`)
		}

		await setupLocalWordPress(dir, conn)
		await writeEnv(dir, preset, conn, { force: true, yes: false })
		await syncRemote(conn)

		p.note([`cd ${name}`, ...(depsInstalled ? [] : [`${pm} install`]), ``, ...nextStepsLines(conn.mode)].join("\n"), "Next steps")

		p.outro("Kizlo is ready 🎉")
	},
})
