/**
 * Build-time template extractor.
 *
 * Reads each `templates/<framework>/kizlo.template.json` manifest and emits a generated module the
 * CLI consumes. Two kinds of entries come out of the template — the single source of truth for both:
 *
 * - `initFiles` → whole Kizlo wiring files. `init` writes them; `create` copies the folder. Bodies
 *   are tokenized so `init` can reconstruct them: path prefixes become `{{kizloDir}}` / `{{appDir}}`,
 *   and the import specifier pointing at the server entry becomes `{{serverImport}}`.
 * - `patches` → files that already exist in a target project (e.g. `app/layout.tsx`). The named
 *   export declarations that are Kizlo wiring, plus the imports they need, are pulled out (parsed with
 *   magicast, the same parser the runtime patch engine uses) so `init` can merge them into the user's
 *   own file — adding or replacing, never clobbering.
 *
 * The manifest is the single declaration of which files/symbols are Kizlo wiring and where they sit,
 * so anything moved-but-unlisted fails this script — structure drift becomes a build error instead of
 * a silent runtime split between `create` and `init`.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { generateCode, parseModule } from "magicast"

/** Nearest ancestor of `from` (inclusive) that contains `marker`; independent of this script's depth. */
function findUp(from: string, marker: string): string {
	let dir = from
	while (true) {
		if (fs.existsSync(path.join(dir, marker))) return dir
		const parent = path.dirname(dir)
		if (parent === dir) throw new Error(`Could not locate "${marker}" above ${from}`)
		dir = parent
	}
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const packageDir = findUp(scriptDir, "package.json")
const repoRoot = findUp(scriptDir, "pnpm-workspace.yaml")
const templatesDir = path.join(repoRoot, "templates")
const outFile = path.join(packageDir, "src/cli/presets/generated/templates.ts")

interface Tokens {
	kizloDir: string
	appDir: string
	alias: string
}

interface Manifest {
	framework: string
	tokens: Tokens
	initFiles: { role: string; path: string }[]
	patches?: { label: string; path: string; exports: string[] }[]
}

interface TemplateFile {
	role: string
	tokenizedPath: string
	body: string
}

interface PatchImport {
	module: string
	names: string[]
}

interface TemplatePatch {
	label: string
	tokenizedFile: string
	imports: PatchImport[]
	exports: { name: string; value: string }[]
}

/** The import specifier the template's files use to reach the server entry (e.g. `@/lib/kizlo/server`). */
function serverImportSpecifier(tokens: Tokens): string {
	const withoutSrc = tokens.kizloDir.replace(/^src\//, "")
	return `${tokens.alias.replace(/\/+$/, "")}/${withoutSrc}/server`
}

/** Swap a concrete path prefix (`src/app/...`, `src/lib/kizlo/...`) for its `{{token}}`. */
function tokenizePath(relPath: string, tokens: Tokens): string {
	const normalized = relPath.split(path.sep).join("/")
	if (normalized === tokens.appDir || normalized.startsWith(`${tokens.appDir}/`)) return normalized.replace(tokens.appDir, "{{appDir}}")
	if (normalized === tokens.kizloDir || normalized.startsWith(`${tokens.kizloDir}/`))
		return normalized.replace(tokens.kizloDir, "{{kizloDir}}")
	return normalized
}

function readFileOrThrow(abs: string, manifestPath: string, listed: string, kind: string): string {
	if (!fs.existsSync(abs)) {
		throw new Error(
			`Template manifest ${path.relative(repoRoot, manifestPath)} lists ${kind} "${listed}", but that file does not exist. ` +
				`Update the manifest to match the template's structure.`,
		)
	}
	return fs.readFileSync(abs, "utf8")
}

function extractInitFiles(dir: string, manifest: Manifest, manifestPath: string): TemplateFile[] {
	const serverImport = serverImportSpecifier(manifest.tokens)
	return manifest.initFiles.map((entry) => {
		const raw = readFileOrThrow(path.join(dir, entry.path), manifestPath, entry.path, `init file`)
		const body = raw.split(serverImport).join("{{serverImport}}")
		return { role: entry.role, tokenizedPath: tokenizePath(entry.path, manifest.tokens), body }
	})
}

/** Pull a file's Kizlo-wiring exports + the imports they rely on, so `init` can merge them elsewhere. */
function extractPatch(dir: string, patch: NonNullable<Manifest["patches"]>[number], tokens: Tokens, manifestPath: string): TemplatePatch {
	const source = readFileOrThrow(path.join(dir, patch.path), manifestPath, patch.path, "patch file")
	const serverImport = serverImportSpecifier(tokens)
	const mod = parseModule(source, { sourceFileName: patch.path })
	const where = `${path.relative(repoRoot, manifestPath)} → "${patch.path}"`

	// Each listed wiring export is `export const <name> = <expr>`; store just the initializer expression
	// so the patch engine can re-emit it into a user's file with `export const <name> = <value>`.
	const exportNames = Object.keys(mod.exports)
	const exports = patch.exports.map((name) => {
		if (!exportNames.includes(name)) throw new Error(`Template patch ${where} has no exported "${name}".`)
		return { name, value: generateCode(mod.exports[name]).code }
	})

	// The wiring imports the file pulls in — Kizlo packages plus the server entry, grouped per module.
	// React/CSS/type-only imports are left out, since those already exist in the user's own file.
	const imports: PatchImport[] = []
	for (const item of mod.imports.$items) {
		if (!(item.from.startsWith("kizlo/") || item.from === serverImport)) continue
		const module = item.from === serverImport ? "{{serverImport}}" : item.from
		let group = imports.find((g) => g.module === module)
		if (!group) {
			group = { module, names: [] }
			imports.push(group)
		}
		if (!group.names.includes(item.imported)) group.names.push(item.imported)
	}

	return { label: patch.label, tokenizedFile: tokenizePath(patch.path, tokens), imports, exports }
}

function extract(manifestPath: string): { framework: string; files: TemplateFile[]; patches: TemplatePatch[] } {
	const dir = path.dirname(manifestPath)
	const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest
	const files = extractInitFiles(dir, manifest, manifestPath)
	const patches = (manifest.patches ?? []).map((patch) => extractPatch(dir, patch, manifest.tokens, manifestPath))
	return { framework: manifest.framework, files, patches }
}

function main(): void {
	if (!fs.existsSync(templatesDir)) throw new Error(`No templates directory at ${templatesDir}`)

	const subsets: Record<string, TemplateFile[]> = {}
	const patchSets: Record<string, TemplatePatch[]> = {}
	for (const entry of fs.readdirSync(templatesDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue
		const manifestPath = path.join(templatesDir, entry.name, "kizlo.template.json")
		if (!fs.existsSync(manifestPath)) continue
		const { framework, files, patches } = extract(manifestPath)
		subsets[framework] = files
		patchSets[framework] = patches
	}

	const header = `// GENERATED by scripts/extract-templates.ts — do not edit.
// Regenerated on every build from the templates/*/kizlo.template.json manifests.

export interface TemplateFile {
	/** Which Kizlo wiring file this is (server-entry, client, api-route, …). */
	role: string
	/** Path relative to the project root with project-variable prefixes tokenized (\`{{kizloDir}}\`, \`{{appDir}}\`). */
	tokenizedPath: string
	/** File body with the server-entry import specifier tokenized (\`{{serverImport}}\`). */
	body: string
}

export interface PatchImport {
	/** Module to import from; \`{{serverImport}}\` resolves per file at apply time. */
	module: string
	/** Named imports to ensure are present. */
	names: string[]
}

export interface TemplatePatch {
	/** Human label for prompts/logs (e.g. "root layout"). */
	label: string
	/** Target file, project-variable prefixes tokenized (\`{{appDir}}\`). */
	tokenizedFile: string
	/** Wiring imports the exports below depend on. */
	imports: PatchImport[]
	/** Exports to add as \`export const <name> = <value>\` — or replace if the target already defines them. */
	exports: { name: string; value: string }[]
}

export const TEMPLATE_SUBSETS: Record<string, TemplateFile[]> = ${JSON.stringify(subsets, null, "\t")}

export const TEMPLATE_PATCHES: Record<string, TemplatePatch[]> = ${JSON.stringify(patchSets, null, "\t")}
`

	fs.mkdirSync(path.dirname(outFile), { recursive: true })
	// Write only when the content actually changed. The output lives inside the watched `src/` tree, so
	// rewriting it every run (even with identical bytes) churns its mtime and retriggers watchers —
	// under `turbo watch dev`, which re-runs this script on each restart, that becomes a rebuild loop.
	const current = fs.existsSync(outFile) ? fs.readFileSync(outFile, "utf8") : undefined
	const fileCount = Object.values(subsets).reduce((n, files) => n + files.length, 0)
	const patchCount = Object.values(patchSets).reduce((n, patches) => n + patches.length, 0)
	if (current === header) {
		console.log(`Templates up to date (${fileCount} file(s) + ${patchCount} patch(es)) → ${path.relative(repoRoot, outFile)}`)
		return
	}
	fs.writeFileSync(outFile, header)
	console.log(
		`Extracted ${fileCount} file(s) + ${patchCount} patch(es) across ${Object.keys(subsets).length} framework(s) → ${path.relative(repoRoot, outFile)}`,
	)
}

main()
