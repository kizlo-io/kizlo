import fs from "node:fs"
import path from "node:path"
import { createJiti } from "jiti"
import { CONTRACT_GENERATION_ENV } from "../../shared/constants"

/**
 * Loads a TypeScript module through jiti while tolerating framework virtual modules
 * (`astro:env/server`, `virtual:*`, `#imports`, `$env/*`, …). These are synthesized by the
 * framework's bundler at build time and don't exist on disk, so jiti can't resolve them — but
 * contract generation only needs the module's exported *shape*, never the runtime values a
 * virtual module carries. We discover them from the project's own source rather than maintaining
 * a per-framework list: import, and whenever jiti reports a missing module, stub it and retry.
 *
 * A virtual module is distinguished from a genuinely missing dependency by the one property that
 * always holds — a virtual module is never a declared dependency, so a bare specifier whose
 * package isn't in `package.json` is treated as virtual, while a declared-but-unresolvable
 * dependency is surfaced as the real error it is.
 */
export async function importIgnoringVirtualModules<T>(cwd: string, entry: string): Promise<T> {
	const deps = declaredDeps(cwd)
	const virtualModules: Record<string, unknown> = {}

	// This import reads the module's exported *shape* only, never runtime values. Signal that to the
	// Kizlo server factory so its eager env resolution (`requireEnv`) yields placeholders instead of
	// throwing on connection env vars that a real request would need but shape extraction never touches.
	const previousGenerationFlag = process.env[CONTRACT_GENERATION_ENV]
	process.env[CONTRACT_GENERATION_ENV] = "1"
	try {
		return await importLoop<T>(cwd, entry, deps, virtualModules)
	} finally {
		if (previousGenerationFlag === undefined) delete process.env[CONTRACT_GENERATION_ENV]
		else process.env[CONTRACT_GENERATION_ENV] = previousGenerationFlag
	}
}

async function importLoop<T>(cwd: string, entry: string, deps: Set<string>, virtualModules: Record<string, unknown>): Promise<T> {
	for (;;) {
		// `tsconfigPaths` resolves the project's own `compilerOptions.paths` aliases (`@/*`, `~/*`) to
		// real files. Without it those bare specifiers fail resolution and the stub guard below would
		// wrongly treat a real local module as a virtual one.
		const jiti = createJiti(cwd, { moduleCache: false, tsconfigPaths: true, virtualModules })
		try {
			return await jiti.import<T>(entry)
		} catch (error) {
			const spec = missingSpecifier(error)
			// Not a resolution failure, a relative/absolute miss (a real bug, not virtual), an
			// already-stubbed specifier still failing, or a declared dependency → surface it.
			if (!spec || !isBareSpecifier(spec) || spec in virtualModules || deps.has(packageNameOf(spec))) {
				throw error
			}
			virtualModules[spec] = makeVirtualStub()
		}
	}
}

/**
 * A no-op module namespace that satisfies any import shape (named, default, nested, callable),
 * so a virtual module can be stubbed without knowing what it exports. The `has` trap is required:
 * without it jiti's `interopDefault` sees a truthy `.default` and routes named lookups down a path
 * that misses.
 *
 * Every export — named, default, nested, callable — is a no-op, so contract generation only ever
 * reads the module's shape, never a real value a virtual module would carry at runtime.
 */
function makeVirtualStub(): unknown {
	const stub: unknown = new Proxy(() => {}, {
		apply: () => undefined,
		has: (_t, prop) => typeof prop === "string" && prop !== "then",
		get: (_t, prop) => {
			if (prop === "__esModule") return true
			if (prop === "then") return undefined // never thenable
			if (typeof prop === "symbol") return undefined
			return stub // any export → recursive no-op
		},
	})
	return stub
}

/** Names of every declared dependency; empty when `package.json` is absent or unreadable. */
function declaredDeps(cwd: string): Set<string> {
	try {
		const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8")) as {
			dependencies?: Record<string, string>
			devDependencies?: Record<string, string>
			peerDependencies?: Record<string, string>
			optionalDependencies?: Record<string, string>
		}
		return new Set([
			...Object.keys(pkg.dependencies ?? {}),
			...Object.keys(pkg.devDependencies ?? {}),
			...Object.keys(pkg.peerDependencies ?? {}),
			...Object.keys(pkg.optionalDependencies ?? {}),
		])
	} catch {
		return new Set()
	}
}

/** The specifier jiti/Node reported unresolvable, or undefined when the error isn't a resolution failure. */
function missingSpecifier(error: unknown): string | undefined {
	const err = error as { code?: string; message?: string }
	if (err?.code !== "MODULE_NOT_FOUND" && err?.code !== "ERR_MODULE_NOT_FOUND") return undefined
	return /Cannot find module '([^']+)'/.exec(err.message ?? "")?.[1]
}

/** Virtual specifiers are always bare; a missing relative/absolute path is a real bug, not a virtual module. */
function isBareSpecifier(spec: string): boolean {
	return !spec.startsWith(".") && !spec.startsWith("/")
}

/** Package name of a bare specifier: `@scope/x/sub` → `@scope/x`, `astro:env/server` → `astro:env`. */
function packageNameOf(spec: string): string {
	const parts = spec.split("/")
	return spec.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? spec)
}
