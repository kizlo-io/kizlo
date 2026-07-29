import fs from "node:fs"
import path from "node:path"
import { builders, detectCodeFormat, generateCode, parseModule } from "magicast"

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

export interface PatchImport {
	/** Module to import from (already resolved — `{{serverImport}}` substituted). */
	module: string
	/** Named imports to ensure are present. */
	names: string[]
}

export interface PatchExport {
	/** Export name to upsert as `export const <name> = <value>`. */
	name: string
	value: string
}

export interface ResolvedPatch {
	label: string
	/** Hint target file relative to cwd, with `{{kizloDir}}` / `{{appDir}}` substituted. */
	relPath: string
	imports: PatchImport[]
	exports: PatchExport[]
}

export interface PatchChanges {
	/** Named imports added (merged into an existing import or via a new import). */
	addedImports: string[]
	/** Exports appended because the file didn't define them. */
	addedExports: string[]
	/** Existing exports overwritten with Kizlo's version (includes a static Next counterpart swap). */
	replacedExports: string[]
}

/** Whether a patch actually modified the file (vs. a no-op / already-wired outcome). */
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

/** Minimal structural view of the Babel AST magicast exposes via `$ast` — enough to reorder the body. */
interface AstNode {
	type: string
	[key: string]: unknown
}

/** The module's statement list (magicast's `$ast` is a `Program`, but tolerate a `File` wrapper too). */
function programBody(mod: ReturnType<typeof parseModule>): AstNode[] {
	const ast = mod.$ast as AstNode
	const program = (ast.type === "File" ? (ast.program as AstNode) : ast) as AstNode & { body: AstNode[] }
	return program.body
}

/** The name of an `export const <name> = …` statement, or undefined for any other node. */
function exportedConstName(node: AstNode): string | undefined {
	if (node.type !== "ExportNamedDeclaration") return undefined
	const decl = node.declaration as AstNode | null | undefined
	if (decl?.type !== "VariableDeclaration") return undefined
	const id = (decl.declarations as AstNode[] | undefined)?.[0]?.id as AstNode | undefined
	return id?.type === "Identifier" ? (id.name as string) : undefined
}

/**
 * Move the just-inserted exports (named in `names`) up to sit right after the import block, so wiring
 * lands near the top of the file instead of appended below the component. magicast always appends a new
 * export to the end of the program; this re-splices those nodes in after the last import, preserving
 * their declared order. Exports we replaced in place are untouched — only nodes we added this run move.
 */
function hoistExportsAfterImports(mod: ReturnType<typeof parseModule>, names: readonly string[]): void {
	const body = programBody(mod)
	const moved: AstNode[] = []
	for (const name of names) {
		const idx = body.findIndex((node) => exportedConstName(node) === name)
		if (idx !== -1) moved.push(body.splice(idx, 1)[0] as AstNode)
	}
	let insertAt = 0
	for (let i = 0; i < body.length; i++) if (body[i]?.type === "ImportDeclaration") insertAt = i + 1
	body.splice(insertAt, 0, ...moved)
}

/**
 * Merge a resolved patch into `source` by parsing it with magicast (a real TS/JS/JSX parser via Babel,
 * so declarations are bounded exactly — never by a text heuristic). Missing imports are added; each
 * export is upserted — set with `builders`, which replaces it if present and adds it if not — and a
 * static Next counterpart (`metadata` for `generateMetadata`) is dropped as part of a replace. The
 * upsert is deliberate replace-always: we cannot distinguish a user's own `generateMetadata` from a
 * stale copy of ours, and those values come from WordPress (edited in wp-admin, not the file), so the
 * export body isn't meant to be hand-customized. Idempotent: an export already equal to ours is left
 * untouched, so re-running never churns the file.
 *
 * magicast appends new exports to the end of the file; we then hoist the ones we added this run up to
 * sit right after the import block, so wiring reads near the top instead of below the component. Exports
 * replaced in place keep their position — only nodes newly inserted this run move.
 *
 * Throws if the target cannot be parsed or regenerated. Callers must NOT swallow that — a file we
 * can't parse is one we must not guess at, so wiring falls back to a printed instruction instead.
 */
export function applyPatchToSource(
	source: string,
	patch: Pick<ResolvedPatch, "imports" | "exports">,
): { text: string; changes: PatchChanges } {
	const format = detectCodeFormat(source)
	const mod = parseModule(source, { sourceFileName: "layout.tsx", ...format })
	const changes: PatchChanges = { addedImports: [], addedExports: [], replacedExports: [] }
	// Exports magicast appended to the end this run (new or counterpart-swapped) — hoisted after imports below.
	const insertedNames: string[] = []

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
			mod.exports[exp.name] = builders.raw(exp.value)
			changes.replacedExports.push(exp.name)
			continue
		}

		const counterpart = staticCounterpart(exp.name)
		if (counterpart && exportNames.includes(counterpart)) {
			delete mod.exports[counterpart]
			mod.exports[exp.name] = builders.raw(exp.value)
			changes.replacedExports.push(exp.name)
			insertedNames.push(exp.name)
			continue
		}

		mod.exports[exp.name] = builders.raw(exp.value)
		changes.addedExports.push(exp.name)
		insertedNames.push(exp.name)
	}

	if (insertedNames.length) hoistExportsAfterImports(mod, insertedNames)

	return { text: generateCode(mod, { format }).code, changes }
}

/**
 * Render a resolved patch as source the user can paste in, for the printed fallback when the target
 * can't be resolved or parsed. The same declared payload the confident apply upserts, so what we tell
 * the user to add never drifts from what we would have written.
 */
export function renderPatchCode(patch: Pick<ResolvedPatch, "imports" | "exports">): string {
	const imports = patch.imports.map((imp) => `import { ${imp.names.join(", ")} } from "${imp.module}"`)
	const exports = patch.exports.map((exp) => `export const ${exp.name} = ${exp.value}`)
	return `${[...imports, "", ...exports].join("\n")}\n`
}
