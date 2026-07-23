import fs from "node:fs"
import path from "node:path"
import * as p from "@clack/prompts"
import { CONTRACT_BARREL } from "../daemon/generate"
import type { ScaffoldContext, ScaffoldFile } from "../presets"
import { applyPatchToSource, patchChanged, type ResolvedPatch, renderPatchCode } from "../presets/patch"
import { findRootLayout, patchEntries, resolvePatch, type TemplateManifest } from "../presets/template"
import { resolveModuleImport, writeFileIfAbsent } from "../utils"
import { orCancel } from "./_setup"

/** The kizlo.config.ts a scaffolded project gets: the Kizlo directory, optional import alias, and —
 *  for a local dev setup — the WordPress install folder so `kizlo dev` knows where it lives. */
export function kizloConfigTemplate(dir: string, alias: string, devPath?: string): string {
	const aliasLine = alias ? `\n\talias: "${alias}",` : ""
	const devLine = devPath ? `\n\tdev: { path: "${devPath}" },` : ""
	return `import { defineConfig } from "kizlo/config"

export default defineConfig({
	dir: "${dir}",${aliasLine}${devLine}
})
`
}

/**
 * Build the {@link ScaffoldContext} that adapts a template's tokenized paths and imports to a real
 * project. `dirRel` is the Kizlo home directory, `appDir` the App Router directory, and `alias` the
 * import-alias prefix (empty for relative imports). The server-entry import is resolved per calling
 * file so each scaffolded file references the server through the right specifier.
 */
export function buildScaffoldContext(
	cwd: string,
	{ dirRel, appDir, alias, clientUrl }: { dirRel: string; appDir: string; alias: string; clientUrl?: string },
): ScaffoldContext {
	const serverDirRel = path.join(dirRel, "server")
	return {
		kizloDir: dirRel,
		serverDirName: path.basename(serverDirRel),
		serverEntryPath: path.join(serverDirRel, "index.ts"),
		clientPath: path.join(dirRel, "client.ts"),
		appDir,
		serverImport: (fromDir) => resolveModuleImport(cwd, serverDirRel, fromDir, alias),
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

/** Seed the generated-contract directory so imports resolve before the first `kizlo watch`/`generate`. */
export function writeGeneratedContract(cwd: string, serverDirRel: string): void {
	const generatedDirRel = path.join(serverDirRel, "generated")
	writeFileIfAbsent(path.join(cwd, generatedDirRel, "contract.json"), "{}\n")
	writeFileIfAbsent(path.join(cwd, generatedDirRel, "index.ts"), CONTRACT_BARREL)
}

/**
 * Merge Kizlo wiring into files the project already owns (the root layout's SEO exports). Never
 * aborts: the target is resolved by identity (the layout that renders `<html>`), and on any doubt —
 * not found, not parseable — the resolved payload is printed at the end with placement instructions
 * rather than written to a guessed-at file. A confident apply is an idempotent upsert: it replaces
 * our exports if present, adds them if not.
 */
export function applyLayoutPatches(cwd: string, manifest: TemplateManifest, scaffold: ScaffoldContext): void {
	const manualSteps: ResolvedPatch[] = []
	for (const entry of patchEntries(manifest)) {
		const resolved = resolvePatch(entry, manifest.tokens, scaffold)
		const target = findRootLayout(cwd, scaffold.appDir, resolved.relPath)
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
			const parts = [
				...(changes.replacedExports.length ? [`replaced ${changes.replacedExports.join(", ")}`] : []),
				...(changes.addedExports.length ? [`added ${changes.addedExports.join(", ")}`] : []),
				...(changes.addedImports.length ? ["imports"] : []),
			]
			p.log.success(`Wired Kizlo into your ${resolved.label} (${relTarget}) — ${parts.join(", ")}`)
		} else {
			p.log.info(`Your ${resolved.label} is already wired (${relTarget})`)
		}
	}

	for (const resolved of manualSteps) {
		p.note(renderPatchCode(resolved), `Add these to your ${resolved.label} (the layout that renders <html>)`)
	}
}
