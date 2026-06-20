import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import {
	addDependencyArgs,
	detectImportAlias,
	detectPackageManager,
	ensureGitignored,
	envKeysPresent,
	mergeEnv,
	readTsconfigPaths,
	resolveModuleImport,
	stripJsonComments,
	writeFileIfAbsent,
} from "./utils"

let dir: string

beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-utils-"))
})

afterEach(() => {
	fs.rmSync(dir, { recursive: true, force: true })
})

/** Write a tsconfig.json with the given compilerOptions.paths into the temp dir. */
function writeTsconfig(paths: Record<string, string[]>): void {
	fs.writeFileSync(path.join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { paths } }))
}

describe("mergeEnv", () => {
	test("appends keys to an empty file", () => {
		const result = mergeEnv("", { A: "1", B: "2" }, new Set(["A", "B"]))
		expect(result.content).toBe("A=1\nB=2\n")
		expect(result.added).toEqual(["A", "B"])
		expect(result.updated).toEqual([])
		expect(result.kept).toEqual([])
	})

	test("overwrites a managed key when listed in overwriteKeys", () => {
		const result = mergeEnv("A=old\n", { A: "new" }, new Set(["A"]))
		expect(result.content).toBe("A=new\n")
		expect(result.updated).toEqual(["A"])
		expect(result.added).toEqual([])
	})

	test("keeps an existing value when not in overwriteKeys", () => {
		const result = mergeEnv("A=old\n", { A: "new" }, new Set())
		expect(result.content).toBe("A=old\n")
		expect(result.kept).toEqual(["A"])
		expect(result.updated).toEqual([])
	})

	test("preserves comments, blank lines and unrelated variables", () => {
		const existing = "# heading\nOTHER=keep\n\nA=old\n"
		const result = mergeEnv(existing, { A: "new" }, new Set(["A"]))
		expect(result.content).toBe("# heading\nOTHER=keep\n\nA=new\n")
		expect(result.updated).toEqual(["A"])
	})

	test("appends only the missing managed keys", () => {
		const result = mergeEnv("B=2\n", { A: "1", B: "9" }, new Set(["A", "B"]))
		expect(result.content).toBe("B=9\nA=1\n")
		expect(result.added).toEqual(["A"])
		expect(result.updated).toEqual(["B"])
	})
})

describe("stripJsonComments", () => {
	test("removes line and block comments so the result is valid JSON", () => {
		const src = '{\n  "a": 1, // inline\n  /* block */ "b": 2\n}'
		expect(JSON.parse(stripJsonComments(src))).toEqual({ a: 1, b: 2 })
	})

	test("preserves // and /* sequences inside string values", () => {
		const src = '{ "url": "https://example.com/*not-a-comment*/" }'
		expect(JSON.parse(stripJsonComments(src))).toEqual({ url: "https://example.com/*not-a-comment*/" })
	})
})

describe("readTsconfigPaths", () => {
	test("reads paths from a tsconfig that contains comments (JSONC)", () => {
		fs.writeFileSync(path.join(dir, "tsconfig.json"), '{\n  // path aliases\n  "compilerOptions": { "paths": { "@/*": ["./src/*"] } }\n}')
		expect(readTsconfigPaths(dir)).toEqual({ "@/*": ["./src/*"] })
	})

	test("returns undefined when there is no tsconfig", () => {
		expect(readTsconfigPaths(dir)).toBeUndefined()
	})
})

describe("envKeysPresent", () => {
	test("reports declared keys and ignores commented or absent ones", () => {
		const contents = "A=1\n#B=2\n  C = 3\n"
		expect(envKeysPresent(contents, ["A", "B", "C", "D"])).toEqual(["A", "C"])
	})
})

describe("detectImportAlias", () => {
	test("resolves a tsconfig alias rooted at ./src", () => {
		writeTsconfig({ "@/*": ["./src/*"] })
		expect(detectImportAlias(dir, "src/lib/kizlo/server")).toEqual({ prefix: "@", importPath: "@/lib/kizlo/server" })
	})

	test("resolves an alias rooted at the project root", () => {
		writeTsconfig({ "~/*": ["./*"] })
		expect(detectImportAlias(dir, "lib/kizlo")).toEqual({ prefix: "~", importPath: "~/lib/kizlo" })
	})

	test("returns undefined when no alias covers the target", () => {
		writeTsconfig({ "@/*": ["./src/*"] })
		expect(detectImportAlias(dir, "packages/elsewhere")).toBeUndefined()
	})

	test("resolves an alias from a tsconfig that contains comments", () => {
		fs.writeFileSync(path.join(dir, "tsconfig.json"), '{ /* paths */ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }')
		expect(detectImportAlias(dir, "src/lib/kizlo")).toEqual({ prefix: "@", importPath: "@/lib/kizlo" })
	})

	test("returns undefined when there is no tsconfig", () => {
		expect(detectImportAlias(dir, "src/lib/kizlo")).toBeUndefined()
	})
})

describe("resolveModuleImport", () => {
	test("builds a relative import when alias is an empty string", () => {
		expect(resolveModuleImport(dir, "src/lib/kizlo/server", "src/app/api", "")).toBe("../../lib/kizlo/server")
	})

	test("uses the project's base mapping when an explicit alias prefix matches", () => {
		writeTsconfig({ "@/*": ["./src/*"] })
		expect(resolveModuleImport(dir, "src/lib/kizlo/server", "src/app/api", "@")).toBe("@/lib/kizlo/server")
	})

	test("falls back to stripping src/ when the alias has no tsconfig mapping", () => {
		expect(resolveModuleImport(dir, "src/lib/kizlo/server", "src/app/api", "@")).toBe("@/lib/kizlo/server")
	})

	test("detects the alias from tsconfig when none is passed", () => {
		writeTsconfig({ "@/*": ["./src/*"] })
		expect(resolveModuleImport(dir, "src/lib/kizlo/server", "src/app/api")).toBe("@/lib/kizlo/server")
	})

	test("falls back to a relative import when nothing is configured", () => {
		expect(resolveModuleImport(dir, "src/lib/kizlo/server", "src/app/api")).toBe("../../lib/kizlo/server")
	})
})

describe("detectPackageManager", () => {
	test.each([
		["pnpm-lock.yaml", "pnpm"],
		["yarn.lock", "yarn"],
		["bun.lock", "bun"],
	])("detects %s -> %s", (lockfile, expected) => {
		fs.writeFileSync(path.join(dir, lockfile), "")
		expect(detectPackageManager(dir)).toBe(expected)
	})

	test("defaults to npm without a recognised lockfile", () => {
		expect(detectPackageManager(dir)).toBe("npm")
	})
})

describe("addDependencyArgs", () => {
	test("npm uses install", () => {
		expect(addDependencyArgs("npm", "kizlo")).toEqual(["npm", "install", "kizlo"])
	})

	test("other managers use add", () => {
		expect(addDependencyArgs("pnpm", "kizlo")).toEqual(["pnpm", "add", "kizlo"])
		expect(addDependencyArgs("yarn", "kizlo")).toEqual(["yarn", "add", "kizlo"])
		expect(addDependencyArgs("bun", "kizlo")).toEqual(["bun", "add", "kizlo"])
	})
})

describe("writeFileIfAbsent", () => {
	test("creates the file (and parent dirs) when absent", () => {
		const target = path.join(dir, "nested/deep/file.ts")
		expect(writeFileIfAbsent(target, "hello")).toBe(true)
		expect(fs.readFileSync(target, "utf8")).toBe("hello")
	})

	test("leaves an existing file untouched", () => {
		const target = path.join(dir, "file.ts")
		fs.writeFileSync(target, "original")
		expect(writeFileIfAbsent(target, "replacement")).toBe(false)
		expect(fs.readFileSync(target, "utf8")).toBe("original")
	})
})

describe("ensureGitignored", () => {
	test("creates .gitignore when missing", () => {
		expect(ensureGitignored(dir, ".env")).toBe("created")
		expect(fs.readFileSync(path.join(dir, ".gitignore"), "utf8")).toBe(".env\n")
	})

	test("appends the entry to an existing file without a trailing newline", () => {
		fs.writeFileSync(path.join(dir, ".gitignore"), "node_modules")
		expect(ensureGitignored(dir, ".env")).toBe("added")
		expect(fs.readFileSync(path.join(dir, ".gitignore"), "utf8")).toBe("node_modules\n.env\n")
	})

	test("is a no-op when the entry already exists", () => {
		fs.writeFileSync(path.join(dir, ".gitignore"), ".env\n")
		expect(ensureGitignored(dir, ".env")).toBe("present")
		expect(fs.readFileSync(path.join(dir, ".gitignore"), "utf8")).toBe(".env\n")
	})
})
