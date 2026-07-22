import fs from "node:fs"
import path from "node:path"
import * as p from "@clack/prompts"
import { defineCommand } from "citty"
import { downloadTemplate } from "giget"
import z from "zod/v4"
import { printBanner } from "../banner"
import { getPreset } from "../presets"
import { detectPackageManager, getVersion } from "../utils"
import { dockerAvailable } from "../wp/docker"
import {
	collectConnectionInteractively,
	nextStepsNote,
	orCancel,
	setupLocalWordPress,
	syncRemote,
	validate,
	withApiPath,
	writeEnv,
} from "./_setup"

/** GitHub repo the full templates are fetched from, matching the release-tag scheme. */
const TEMPLATE_REPO = "github:kizlo-io/kizlo"

/**
 * The templates `create` can scaffold from. Each id is both the `templates/<id>` folder and the
 * preset that drives its WordPress setup. When only one exists the template prompt auto-selects it.
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

/**
 * Resolve where the template is fetched from. Defaults to the GitHub repo pinned to the release
 * tag matching this CLI version (`kizlo-v<version>`), so the template and the `kizlo` dependency it
 * pulls come from the same release. `KIZLO_TEMPLATE_REF` overrides the ref (e.g. `main`) and
 * `KIZLO_TEMPLATE_LOCAL_DIR` points at a local `templates/` directory for pre-release development.
 */
function templateSource(template: TemplateId): { local?: string; remote?: string } {
	const localDir = process.env.KIZLO_TEMPLATE_LOCAL_DIR
	if (localDir) return { local: path.resolve(localDir, template) }
	const ref = process.env.KIZLO_TEMPLATE_REF ?? `kizlo-v${getVersion()}`
	return { remote: `${TEMPLATE_REPO}/templates/${template}#${ref}` }
}

/**
 * Copy the template into `dir`, then make it a standalone project: rewrite the `workspace:*` Kizlo
 * dependency to this CLI's version and name the package after the project folder. The template's
 * `kizlo.template.json` is an internal build input, so it's removed once the copy lands.
 */
export async function scaffoldTemplate(template: TemplateId, dir: string, name: string): Promise<void> {
	const source = templateSource(template)
	if (source.local) {
		if (!fs.existsSync(source.local)) throw new Error(`Local template not found: ${source.local}`)
		fs.cpSync(source.local, dir, { recursive: true })
	} else {
		await downloadTemplate(source.remote as string, { dir, forceClean: true })
	}

	fs.rmSync(path.join(dir, "kizlo.template.json"), { force: true })

	const pkgPath = path.join(dir, "package.json")
	const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
		name?: string
		private?: boolean
		dependencies?: Record<string, string>
	}
	pkg.name = name
	if (pkg.dependencies?.kizlo === "workspace:*") pkg.dependencies.kizlo = `^${getVersion()}`
	fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, "\t")}\n`)
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

		// Resolve the template. An unknown first positional is a self-correcting error rather than a
		// silent fallback, so a name typed where a template belongs reports the available list.
		const requested = args.template as string | undefined
		let template: TemplateId
		if (requested) {
			if (!isTemplate(requested)) {
				p.cancel(`Unknown template "${requested}". Available: ${TEMPLATES.join(", ")}`)
				process.exit(1)
			}
			template = requested
		} else if (TEMPLATES.length === 1) {
			template = TEMPLATES[0]
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

		const conn = await collectConnectionInteractively(preset)
		if (preset.apiPath && conn.baseUrl) conn.baseUrl = withApiPath(conn.baseUrl, preset.apiPath)

		if (conn.mode === "local" && !(await dockerAvailable())) {
			p.cancel("Docker isn't available — start Docker (or install it) and re-run, or choose “Use my own WordPress”.")
			process.exit(1)
		}

		const s = p.spinner()
		s.start(`Creating ${name} from the ${template} template`)
		try {
			await scaffoldTemplate(template, dir, name)
			s.stop(`Created ${name}`)
		} catch (error) {
			s.stop("Could not create the project")
			p.cancel(error instanceof Error ? error.message : String(error))
			process.exit(1)
		}

		await setupLocalWordPress(dir, conn)
		await writeEnv(dir, preset, conn, { force: true, yes: false })
		await syncRemote(conn)

		const pm = detectPackageManager(dir)
		p.note([`cd ${name}`, `${pm} install`].join("\n"), "Get started")
		nextStepsNote(conn.mode)

		p.outro("Kizlo is ready 🎉")
	},
})
