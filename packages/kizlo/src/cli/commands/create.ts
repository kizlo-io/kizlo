import fs from "node:fs"
import path from "node:path"
import * as p from "@clack/prompts"
import { defineCommand } from "citty"
import z from "zod/v4"
import { printBanner } from "../banner"
import { getPreset } from "../presets"
import { fetchTemplate } from "../presets/source"
import { readManifest } from "../presets/template"
import { availablePackageManagers, detectInvokingPackageManager, getVersion, type PackageManager } from "../utils"
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

/**
 * The templates `create` can scaffold from. Each id is both the `templates/<id>` folder and the
 * preset that drives its WordPress setup.
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

/** Directory entries never copied into a scaffolded project — the internal manifest and build junk. */
const SKIP_COPY = new Set(["template.json", "node_modules", ".next", ".turbo", ".git"])

/**
 * Copy the template into `dir`, then make it a standalone project: name the package after the
 * project folder and resolve the monorepo-only `workspace:*` Kizlo dependency to the version the
 * template declares (`kizloVersion` in its manifest, stamped at release), falling back to the running
 * CLI's version. The version the project runs is the template's to decide, not a moving `latest` tag.
 * The template's `template.json` is an internal input, so it's left out of the copy — as is
 * local build junk (`node_modules`, `.next`, …) that only exists on the `KIZLO_TEMPLATE_LOCAL_DIR` path.
 */
export async function scaffoldTemplate(template: TemplateId, dir: string, name: string): Promise<void> {
	const { dir: src, cleanup } = await fetchTemplate(template)
	let kizloVersion: string
	try {
		kizloVersion = readManifest(src).kizloVersion ?? `^${getVersion()}`
		fs.cpSync(src, dir, { recursive: true, filter: (from) => !SKIP_COPY.has(path.basename(from)) })
	} finally {
		cleanup()
	}

	const pkgPath = path.join(dir, "package.json")

	if (!fs.existsSync(pkgPath)) {
		fs.rmSync(dir, { recursive: true, force: true })
		throw new Error(`Template "${template}" wasn't found. Check the template name and your network connection, then try again.`)
	}
	const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
		name?: string
		private?: boolean
		dependencies?: Record<string, string>
	}
	pkg.name = name
	if (pkg.dependencies?.kizlo === "workspace:*") pkg.dependencies.kizlo = kizloVersion
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

		p.note([`cd ${name}`, `${pm} install`].join("\n"), "Get started")
		nextStepsNote(conn.mode)

		p.outro("Kizlo is ready 🎉")
	},
})
