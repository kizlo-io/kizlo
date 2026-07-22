import fs from "node:fs"
import path from "node:path"
import { builders, detectCodeFormat, generateCode, parseModule } from "magicast"
import { TEMPLATE_PATCHES, type TemplatePatch } from "./generated/templates"
import type { ScaffoldContext } from "./types"

export type { TemplatePatch } from "./generated/templates"

/** Extensions a patch target might really use, in preference order. The template names files `.tsx`,
 * but a JS project's layout may be `.js`/`.jsx`, so init probes these to find the actual file. */
const PATCH_TARGET_EXTS = [".tsx", ".jsx", ".ts", ".js", ".mjs", ".cjs"] as const

/**
 * Resolve a patch's tokenized target to the real file on disk, trying the common component
 * extensions so a JS project's `layout.js`/`layout.jsx` is found — not just the template's `.tsx`.
 * Returns undefined when no candidate exists.
 */
export function resolvePatchTargetPath(cwd: string, relPath: string): string | undefined {
	const direct = path.join(cwd, relPath)
	if (fs.existsSync(direct)) return direct
	const base = relPath.replace(/\.[^./]+$/, "")
	for (const ext of PATCH_TARGET_EXTS) {
		const candidate = path.join(cwd, `${base}${ext}`)
		if (fs.existsSync(candidate)) return candidate
	}
	return undefined
}

/** The Kizlo-wiring patches for a framework (files init merges into rather than writes). */
export function templatePatches(framework: string): TemplatePatch[] {
	return TEMPLATE_PATCHES[framework] ?? []
}

export interface ResolvedPatch {
	label: string
	/** Target file relative to cwd, with `{{kizloDir}}` / `{{appDir}}` substituted. */
	relPath: string
	imports: { module: string; names: string[] }[]
	exports: { name: string; value: string }[]
}

/** Substitute the path/import tokens for a patch against the project's real directories. */
export function resolvePatch(patch: TemplatePatch, ctx: ScaffoldContext): ResolvedPatch {
	const relPath = patch.tokenizedFile.replaceAll("{{kizloDir}}", ctx.kizloDir).replaceAll("{{appDir}}", ctx.appDir)
	const fromDir = path.posix.dirname(relPath)
	const imports = patch.imports.map((imp) => ({
		module: imp.module.replaceAll("{{serverImport}}", ctx.serverImport(fromDir)),
		names: imp.names,
	}))
	return { label: patch.label, relPath, imports, exports: patch.exports }
}

export interface PatchChanges {
	/** Named imports added (merged into an existing import or via a new import). */
	addedImports: string[]
	/** Exports appended because the file didn't define them. */
	addedExports: string[]
	/** Existing exports overwritten with Kizlo's version (includes a static Next counterpart swap). */
	replacedExports: string[]
	/** Conflicting exports left in place because `replaceConflicts` was false (promptable / `--force`). */
	keptExports: string[]
}

/** Whether a patch actually modified the file (vs. a no-op / kept outcome). */
export function patchChanged(changes: PatchChanges): boolean {
	return Boolean(changes.addedImports.length || changes.addedExports.length || changes.replacedExports.length)
}

/**
 * Next.js pairs a dynamic `generateX` export with a static `x` export (e.g. `generateMetadata` and
 * `metadata`) and rejects a file that declares both. When we add a `generateX`, its static
 * counterpart is a conflict too — return `metadata` for `generateMetadata`, `viewport` for
 * `generateViewport`, and so on; undefined for anything that isn't a `generate*` name.
 */
function staticCounterpart(name: string): string | undefined {
	const match = /^generate([A-Z]\w*)$/.exec(name)
	if (!match) return undefined
	const rest = match[1] ?? ""
	return rest.charAt(0).toLowerCase() + rest.slice(1)
}

/** Whitespace-insensitive equality, for telling "already our wiring" apart from a user's own export. */
function sameExpr(a: string, b: string): boolean {
	return a.replace(/\s+/g, "") === b.replace(/\s+/g, "")
}

/**
 * Merge a resolved patch into `source` by parsing it with magicast (a real TS/JS/JSX parser via Babel,
 * so declarations are bounded exactly — never by a text heuristic). Imports and absent exports are
 * added; an export the file already defines is replaced surgically when `replaceConflicts` is set, else
 * kept. A static Next counterpart (`metadata` for `generateMetadata`) is dropped as part of a replace.
 * Idempotent: an export whose current value already equals ours is left untouched.
 *
 * Throws if the target cannot be parsed or regenerated. Callers must NOT swallow that — a file we can't
 * parse is one we must not guess at, so wiring stops rather than writing a corrupted file.
 */
export function applyPatchToSource(
	source: string,
	patch: Pick<ResolvedPatch, "imports" | "exports">,
	opts: { replaceConflicts: boolean },
): { text: string; changes: PatchChanges } {
	const format = detectCodeFormat(source)
	const mod = parseModule(source, { sourceFileName: "layout.tsx", ...format })
	const changes: PatchChanges = { addedImports: [], addedExports: [], replacedExports: [], keptExports: [] }

	for (const imp of patch.imports) {
		for (const name of imp.names) {
			if (mod.imports.$items.some((item) => item.from === imp.module && item.imported === name)) continue
			mod.imports.$append({ imported: name, from: imp.module })
			changes.addedImports.push(name)
		}
	}

	for (const exp of patch.exports) {
		const exportNames = Object.keys(mod.exports)

		if (exportNames.includes(exp.name)) {
			if (sameExpr(generateCode(mod.exports[exp.name]).code, exp.value)) continue // already our wiring
			if (!opts.replaceConflicts) {
				changes.keptExports.push(exp.name)
				continue
			}
			mod.exports[exp.name] = builders.raw(exp.value)
			changes.replacedExports.push(exp.name)
			continue
		}

		const counterpart = staticCounterpart(exp.name)
		if (counterpart && exportNames.includes(counterpart)) {
			if (!opts.replaceConflicts) {
				changes.keptExports.push(exp.name)
				continue
			}
			delete mod.exports[counterpart]
			mod.exports[exp.name] = builders.raw(exp.value)
			changes.replacedExports.push(exp.name)
			continue
		}

		mod.exports[exp.name] = builders.raw(exp.value)
		changes.addedExports.push(exp.name)
	}

	return { text: generateCode(mod, { format }).code, changes }
}
