import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { GeneratedDeclaration, GeneratedModule } from "./generate"

type TypeScript = typeof import("typescript")

/**
 * A generated module TypeScript refuses, with every diagnostic attributed to the schema or
 * endpoint whose declaration it landed in.
 *
 * The generator composes types from a document it does not control, and two contributions that
 * each validate can still combine into something that does not compile. Without this the first
 * report is the consuming app's own build, pointing into a file whose header says not to edit it,
 * naming a line the reader did not write and cannot fix where the error appears.
 */
export class GeneratedClientTypeError extends Error {
	readonly diagnostics: string[]

	constructor(diagnostics: string[]) {
		super(
			[
				`The generated WordPress client does not compile, so it was not written.`,
				...diagnostics.map((diagnostic) => `  ${diagnostic}`),
			].join("\n"),
		)
		this.name = "GeneratedClientTypeError"
		this.diagnostics = diagnostics
	}
}

/**
 * `typescript` is an optional peer: a project generating a client compiles it afterwards, so it
 * is all but always present, and requiring it outright would put the whole compiler in the
 * dependency tree of a check most runs pass. Absent, generation proceeds unchecked rather than
 * failing over a guard it cannot run.
 */
let typescript: TypeScript | null | undefined

async function loadTypeScript(): Promise<TypeScript | null> {
	if (typescript === undefined) {
		try {
			typescript = (await import("typescript")).default
		} catch {
			typescript = null
		}
	}
	return typescript
}

/**
 * The installed `kizlo` type declarations, or undefined when the package has not been built.
 *
 * Found by walking up from this module rather than by resolving the `kizlo` specifier, which from
 * inside `kizlo` itself answers with the entry point rather than the types beside it.
 */
function resolveKizloTypes(): string | undefined {
	let dir = path.dirname(fileURLToPath(import.meta.url))

	for (;;) {
		if (fs.existsSync(path.join(dir, "package.json"))) {
			let name: string | undefined
			try {
				name = (JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) as { name?: string }).name
			} catch {
				return undefined
			}
			if (name === "kizlo") {
				const types = path.join(dir, "dist", "index.d.ts")
				return fs.existsSync(types) ? types : undefined
			}
		}

		const parent = path.dirname(dir)
		if (parent === dir) return undefined
		dir = parent
	}
}

/**
 * What the generated module is compiled under. `strict` because the projects it is written into
 * are, and a declaration that only holds without it would break them; `skipLibCheck` because
 * every other file in the program is a `.d.ts` this generation is not responsible for.
 */
function compilerOptions(ts: TypeScript, kizloTypes: string): import("typescript").CompilerOptions {
	return {
		baseUrl: path.dirname(kizloTypes),
		lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		noEmit: true,
		paths: { kizlo: [kizloTypes] },
		skipLibCheck: true,
		strict: true,
		target: ts.ScriptTarget.ES2022,
	}
}

function declarationAt(declarations: GeneratedDeclaration[], start: number | undefined): GeneratedDeclaration | undefined {
	if (start === undefined) return undefined
	return declarations.find((declaration) => start >= declaration.start && start < declaration.end)
}

/**
 * `Cannot find module "kizlo"`, and the failed registry augmentation that follows it.
 *
 * The generated module imports from `kizlo` and nowhere else, so neither can describe a fault in
 * the document. Both mean this check could not be set up, which is a reason to stop checking
 * rather than to refuse a client that may well be sound.
 */
const UNRESOLVED_MODULE = new Set([2307, 2664])

export interface TypecheckOptions {
	/** The `kizlo` declarations to compile against. Defaults to the installed package's. */
	kizloTypes?: string
}

/**
 * Whether the compiler ran. Reported rather than swallowed so a caller that needs the guard, a
 * test above all, can tell a client that compiled from one nothing ever tried to compile.
 */
export type GeneratedClientCheck = "checked" | "skipped"

/**
 * Compile the generated module in memory, and refuse it whole if TypeScript does. Nothing here
 * touches disk: the module is served to the compiler from memory, so a refusal leaves whatever
 * the project already had in place.
 */
export async function assertGeneratedClientCompiles(
	module: GeneratedModule,
	options: TypecheckOptions = {},
): Promise<GeneratedClientCheck> {
	const ts = await loadTypeScript()
	if (!ts) return "skipped"

	const kizloTypes = options.kizloTypes ?? resolveKizloTypes()
	if (!kizloTypes || !fs.existsSync(kizloTypes)) return "skipped"

	// Never written, only resolved against: it sits beside the declarations it imports so that
	// `kizlo` resolves the way it will once the file is on disk in a real project.
	const file = path.join(path.dirname(kizloTypes), "__kizlo_generated__.ts")
	const host = ts.createCompilerHost(compilerOptions(ts, kizloTypes), true)
	const readFile = host.readFile.bind(host)
	const fileExists = host.fileExists.bind(host)
	host.readFile = (name) => (path.resolve(name) === file ? module.source : readFile(name))
	host.fileExists = (name) => path.resolve(name) === file || fileExists(name)

	const program = ts.createProgram([file], compilerOptions(ts, kizloTypes), host)
	const diagnostics = ts
		.getPreEmitDiagnostics(program)
		// Only what the generated module itself is answerable for. Its dependencies are declaration
		// files `skipLibCheck` already excused, and failing generation over one would be a fault the
		// document could not cause and the user could not clear.
		.filter((diagnostic) => diagnostic.file && path.resolve(diagnostic.file.fileName) === file)

	if (!diagnostics.length) return "checked"
	if (diagnostics.some((diagnostic) => UNRESOLVED_MODULE.has(diagnostic.code))) return "skipped"

	throw new GeneratedClientTypeError(
		diagnostics.map((diagnostic) => {
			const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")
			const declaration = declarationAt(module.declarations, diagnostic.start)
			return declaration ? `${declaration.label}: ${message}` : message
		}),
	)
}
