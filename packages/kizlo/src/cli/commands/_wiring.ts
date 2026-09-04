import fs from "node:fs"
import path from "node:path"
import * as p from "@clack/prompts"
import { CONTRACT_BARREL, INTROSPECTION_STUB } from "../daemon/generate"
import type { ScaffoldContext, ScaffoldFile } from "../presets"
import { applyPatchToSource, patchChanged, type ResolvedPatch, renderPatchCode, resolvePatchTargetPath } from "../presets/patch"
import { type PatchEntry, resolvePatch, type TemplateConfig } from "../presets/template"
import { aliasWithSlash, resolveModuleImport, writeFileIfAbsent } from "../utils"
import { orCancel } from "./_setup"

/** The kizlo.config.ts a scaffolded project gets: the Kizlo directory, the import-alias preference, and,
 *  when local WordPress is chosen, `local: true` so `kizlo dev` and `kizlo test` boot the fixed
 *  `.kizlo/local` install (both stacks on with defaults; the object form is for configuring them). The
 *  alias is always written (`""` for relative imports included) so it records a made decision a later
 *  `kizlo init` reads back instead of prompting for it again. The alias is written in its canonical `@/`
 *  form (never a bare `@`) so it reads like the imports it produces. */
export function kizloConfigTemplate(dir: string, alias: string, localWordPress = false): string {
	const aliasLine = `\n\talias: "${aliasWithSlash(alias)}",`
	const localLines = localWordPress ? `\n\tlocal: true,` : ""
	return `import { defineConfig } from "kizlo/config"

export default defineConfig({
	dir: "${dir}",${aliasLine}${localLines}
})
`
}

/**
 * Build the {@link ScaffoldContext} that adapts a template's config (paths and imports) to a real
 * project. `dirRel` is the Kizlo home directory, `hasSrcDir` whether the project keeps source under
 * `src/` (decides the `src/` normalization of template paths), and `alias` the import-alias prefix (empty
 * for relative imports). Imports are resolved per calling file so each scaffolded file references its
 * targets through the right specifier — `importFrom` for any project path (used to retarget every
 * template-alias import), `serverImport` the server-entry shorthand.
 */
export function buildScaffoldContext(
	cwd: string,
	{ dirRel, hasSrcDir, alias, clientUrl }: { dirRel: string; hasSrcDir: boolean; alias: string; clientUrl?: string },
): ScaffoldContext {
	const serverDirRel = path.join(dirRel, "server")
	const importFrom = (targetRel: string, fromDir: string) => resolveModuleImport(cwd, targetRel, fromDir, alias)
	return {
		kizloPath: dirRel,
		serverDirName: path.basename(serverDirRel),
		serverEntryPath: path.join(serverDirRel, "index.ts"),
		clientPath: path.join(dirRel, "client.ts"),
		hasSrcDir,
		serverImport: (fromDir) => importFrom(serverDirRel, fromDir),
		importFrom,
		clientUrl,
	}
}

export type ScaffoldResult = "created" | "overwritten" | "kept"

/**
 * The single overwrite policy for every scaffolded file: create it when absent, overwrite on
 * `--force`, and otherwise ask before clobbering an existing file (keeping it when the user
 * declines or when running non-interactively with `--yes`). Every scaffolded file routes through
 * here rather than deciding for itself, so new files inherit the same behavior for free.
 */
export async function scaffoldFile(cwd: string, file: ScaffoldFile, opts: { force: boolean; yes: boolean }): Promise<ScaffoldResult> {
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

/** Report a {@link scaffoldFile} outcome in the setup commands' usual voice. */
export function reportScaffold(file: ScaffoldFile, result: ScaffoldResult, yes: boolean): void {
	if (result === "kept") {
		p.log.info(`Kept existing ${file.label} (${file.relPath})${yes ? " — pass --force to overwrite" : ""}`)
	} else {
		p.log.success(`${result === "overwritten" ? "Overwrote" : "Created"} ${file.label} (${file.relPath})`)
	}
}

/** Seed the generated-contract directory so imports resolve before the first `kizlo dev`/`generate`. */
export function writeGeneratedContract(cwd: string, serverDirRel: string): void {
	const generatedDirRel = path.join(serverDirRel, "generated")
	writeFileIfAbsent(path.join(cwd, generatedDirRel, "contract.json"), "{}\n")
	writeFileIfAbsent(path.join(cwd, generatedDirRel, "index.ts"), CONTRACT_BARREL)
	writeFileIfAbsent(path.join(cwd, generatedDirRel, "introspection.ts"), INTROSPECTION_STUB)
}

/**
 * Apply every patch a template declares, merging Kizlo wiring into files the project already owns
 * (today: the root layout and home page SEO exports — but the loop is role-agnostic, so a new patch
 * needs no change here). Never aborts: the target is the exact path the template declares (extension-
 * probed so a JS project's `.js`/`.jsx` is found), and on any doubt — the file isn't at that path, or
 * won't parse — the resolved payload is printed at the end with placement instructions rather than
 * written to a guessed-at file. We never scan the tree to find a stand-in. A confident apply is an
 * idempotent upsert: it replaces our exports if present, adds them if not.
 */
export function applyProjectPatches(cwd: string, patches: readonly PatchEntry[], config: TemplateConfig, scaffold: ScaffoldContext): void {
	const manualSteps: ResolvedPatch[] = []
	for (const entry of patches) {
		const resolved = resolvePatch(entry, config, scaffold)
		// A `note`-mode patch is a change Kizlo can't safely auto-merge (e.g. Astro's defineConfig
		// output/adapter): never read or write the file — always print the instruction at the end.
		if (resolved.mode === "note") {
			manualSteps.push(resolved)
			p.log.info(`Update your ${resolved.label} to finish wiring Kizlo — see the change to make below`)
			continue
		}
		const target = resolvePatchTargetPath(cwd, resolved.relPath)
		if (!target) {
			manualSteps.push(resolved)
			p.log.info(`Couldn't find your ${resolved.label} to wire Kizlo into — see the code to add below`)
			continue
		}
		const relTarget = path.relative(cwd, target)
		const src = fs.readFileSync(target, "utf8")
		let applied: ReturnType<typeof applyPatchToSource>
		try {
			applied = applyPatchToSource(src, resolved)
		} catch {
			manualSteps.push(resolved)
			p.log.warn(`Couldn't parse your ${resolved.label} (${relTarget}) — see the code to add below`)
			continue
		}
		const { text, changes } = applied
		if (patchChanged(changes)) {
			fs.writeFileSync(target, text)
			p.log.success(`Wired Kizlo into your ${resolved.label} (${relTarget})`)
		} else {
			p.log.info(`Your ${resolved.label} is already wired (${relTarget})`)
		}
	}

	for (const resolved of manualSteps) {
		const heading =
			resolved.mode === "note"
				? `Update your ${resolved.label} (${resolved.relPath})`
				: `Add these to your ${resolved.label} (${resolved.relPath})`
		printManualStep(heading, renderPatchCode(resolved))
	}
}

/**
 * Print a manual-step code block the user copies into a file. Deliberately avoids `p.note`: clack
 * draws a `│`/`─` box around the body, so selecting the block in a terminal drags those border
 * characters into the clipboard alongside the code. We print the heading through clack for the usual
 * voice, then the code verbatim with no gutter so a terminal selection yields exactly the source.
 */
export function printManualStep(heading: string, code: string): void {
	p.log.step(heading)
	const body = code.endsWith("\n") ? code.slice(0, -1) : code
	process.stdout.write(`\n${body}\n\n`)
}
