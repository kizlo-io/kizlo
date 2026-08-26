import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { isContractGeneration, setContractGeneration } from "../../shared/contract-generation"
import { importIgnoringVirtualModules } from "./jiti"

/**
 * These tests drive the real jiti loader against real files on disk. That is deliberate: the whole
 * point of `importIgnoringVirtualModules` is to tolerate specifiers jiti *can't* resolve while still
 * surfacing the ones it shouldn't touch, so mocking jiti would test nothing. Each case builds a
 * throwaway project under a fresh temp dir (isolated from the repo's own `node_modules`, so a bare
 * import genuinely fails to resolve) and asserts on the exported shape or the thrown error.
 */

let dir: string

beforeEach(() => {
	dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-jiti-")))
})

afterEach(() => {
	fs.rmSync(dir, { recursive: true, force: true })
})

/** Write a file under the temp project, creating parent dirs. Returns its absolute path. */
function write(rel: string, contents: string): string {
	const abs = path.join(dir, rel)
	fs.mkdirSync(path.dirname(abs), { recursive: true })
	fs.writeFileSync(abs, contents)
	return abs
}

/** Write `package.json`; without a call the project has none (declaredDeps returns empty). */
function pkg(json: Record<string, unknown>): void {
	write("package.json", JSON.stringify(json))
}

/** Import a project entry the way the daemon does, from the project's own cwd. */
function load<T = Record<string, unknown>>(entry: string): Promise<T> {
	return importIgnoringVirtualModules<T>(dir, entry)
}

describe("importIgnoringVirtualModules: real modules", () => {
	test("returns the exported shape of a plain module with no virtual deps", async () => {
		const entry = write("src/index.ts", `export const procedures = { name: "posts" }\nexport const answer = 42\n`)
		const mod = await load<{ procedures: { name: string }; answer: number }>(entry)
		expect(mod.procedures).toEqual({ name: "posts" })
		expect(mod.answer).toBe(42)
	})

	test("resolves a tsconfig `paths` alias to the real file instead of stubbing it", async () => {
		pkg({ name: "app" })
		write("tsconfig.json", JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["./src/*"] } } }))
		write("src/lib/secret.ts", `export const marker = "real-aliased-module"\n`)
		const entry = write("src/index.ts", `import { marker } from "@/lib/secret"\nexport const procedures = { marker }\n`)
		const mod = await load<{ procedures: { marker: string } }>(entry)
		// A stubbed alias would surface as a no-op proxy, never the real string.
		expect(mod.procedures.marker).toBe("real-aliased-module")
	})
})

describe("importIgnoringVirtualModules: virtual module stubbing", () => {
	test("stubs an undeclared bare specifier and completes the import", async () => {
		const entry = write(
			"src/index.ts",
			`import { getSecret } from "some-framework-virtual"\nexport const procedures = { ok: true }\nexport const kind = typeof getSecret\n`,
		)
		const mod = await load<{ procedures: { ok: boolean }; kind: string }>(entry)
		expect(mod.procedures).toEqual({ ok: true })
	})

	test("stubs a scheme-style virtual specifier (the real `astro:env/server` case)", async () => {
		const entry = write(
			"src/index.ts",
			`import { getSecret } from "astro:env/server"\nvoid getSecret\nexport const procedures = { ok: true }\n`,
		)
		const mod = await load<{ procedures: { ok: boolean } }>(entry)
		expect(mod.procedures).toEqual({ ok: true })
	})

	test("the stub satisfies default, named, nested, and callable usage at import time", async () => {
		// Every access shape a real virtual module might expose is exercised at module top level; if the
		// stub missed any, evaluating the module would throw and the import would reject.
		const entry = write(
			"src/index.ts",
			[
				`import def, { named } from "virtual:shapes"`,
				`import * as ns from "virtual:shapes"`,
				`const a = def()`,
				`const b = named.deeply.nested.value`,
				`const c = named.callable()`,
				`const d = ns.anything.at.all()`,
				`export const procedures = { a, b: typeof b, c, d }`,
			].join("\n"),
		)
		const mod = await load<{ procedures: Record<string, unknown> }>(entry)
		expect(mod.procedures).toBeDefined()
	})

	test("stubs several distinct virtual specifiers in one import (loop iterates per miss)", async () => {
		const entry = write(
			"src/index.ts",
			[
				`import { a } from "virtual:one"`,
				`import { b } from "virtual:two"`,
				`import { c } from "#imports"`,
				`void a; void b; void c`,
				`export const procedures = { ok: true }`,
			].join("\n"),
		)
		const mod = await load<{ procedures: { ok: boolean } }>(entry)
		expect(mod.procedures).toEqual({ ok: true })
	})

	test("stubs an undeclared scoped bare specifier", async () => {
		const entry = write("src/index.ts", `import x from "@vendor/not-installed/sub"\nvoid x\nexport const procedures = { ok: true }\n`)
		const mod = await load<{ procedures: { ok: boolean } }>(entry)
		expect(mod.procedures).toEqual({ ok: true })
	})
})

describe("importIgnoringVirtualModules: errors that must surface", () => {
	test("surfaces a missing relative import (a real bug, never a virtual module)", async () => {
		const entry = write("src/index.ts", `import { x } from "./does-not-exist"\nexport const procedures = { x }\n`)
		// Stubbing this would hide a genuine broken import; it must reject instead.
		await expect(load(entry)).rejects.toThrow()
	})

	test("surfaces a declared dependency that fails to resolve, rather than stubbing it", async () => {
		pkg({ name: "app", dependencies: { "totally-missing-pkg": "1.0.0" } })
		const entry = write("src/index.ts", `import x from "totally-missing-pkg"\nvoid x\nexport const procedures = { ok: true }\n`)
		// It is declared, so an unresolvable import is a real install problem, not a virtual module.
		await expect(load(entry)).rejects.toThrow()
	})

	test("surfaces a declared scoped dependency by its package name, not its subpath", async () => {
		pkg({ name: "app", dependencies: { "@scope/pkg": "1.0.0" } })
		const entry = write("src/index.ts", `import x from "@scope/pkg/sub"\nvoid x\nexport const procedures = { ok: true }\n`)
		await expect(load(entry)).rejects.toThrow()
	})

	test("surfaces an error thrown by the module body itself (not a resolution failure)", async () => {
		const entry = write("src/index.ts", `throw new Error("boom from module body")\n`)
		await expect(load(entry)).rejects.toThrow("boom from module body")
	})
})

describe("importIgnoringVirtualModules: contract-generation flag", () => {
	test("the shape-only flag is set while the module body evaluates", async () => {
		const entry = write("src/index.ts", `export const flagWhileImporting = globalThis[Symbol.for("kizlo.contract-generation")] ?? false\n`)
		const mod = await load<{ flagWhileImporting: boolean }>(entry)
		expect(mod.flagWhileImporting).toBe(true)
	})

	test("lets a module that would otherwise throw on missing values complete (the createKizlo case)", async () => {
		// Mirrors `requireEnvValue`: the server factory throws when a connection value is absent, unless the
		// shape-only flag is set. Contract generation must get past that to read the procedure tree's shape.
		const entry = write(
			"src/index.ts",
			[
				`if (!globalThis[Symbol.for("kizlo.contract-generation")]) {`,
				`  throw new Error("Missing apiUrl")`,
				`}`,
				`export const procedures = { ok: true }`,
			].join("\n"),
		)
		const mod = await load<{ procedures: { ok: boolean } }>(entry)
		expect(mod.procedures).toEqual({ ok: true })
	})

	test("restores an inactive flag after a successful import", async () => {
		setContractGeneration(false)
		const entry = write("src/index.ts", `export const procedures = { ok: true }\n`)
		await load(entry)
		expect(isContractGeneration()).toBe(false)
	})

	test("restores an inactive flag even when the import throws", async () => {
		setContractGeneration(false)
		const entry = write("src/index.ts", `throw new Error("boom")\n`)
		await expect(load(entry)).rejects.toThrow()
		expect(isContractGeneration()).toBe(false)
	})

	test("restores a pre-existing active flag instead of clobbering it", async () => {
		setContractGeneration(true)
		try {
			const entry = write("src/index.ts", `export const procedures = { ok: true }\n`)
			await load(entry)
			expect(isContractGeneration()).toBe(true)
		} finally {
			setContractGeneration(false)
		}
	})
})
