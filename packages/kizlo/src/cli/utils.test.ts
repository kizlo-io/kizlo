import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { detectPackageManager, ensureGitignored, envKeysPresent, mergeEnv } from "./utils"

let dir: string

beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-utils-"))
})

afterEach(() => {
	fs.rmSync(dir, { recursive: true, force: true })
})

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

	test("groups appended keys under comment headers", () => {
		const groups = [
			{ comment: "First", keys: ["A", "B"] },
			{ comment: "Second", keys: ["C"] },
		]
		const result = mergeEnv("", { A: "1", B: "2", C: "3" }, new Set(["A", "B", "C"]), groups)
		expect(result.content).toBe("# First\nA=1\nB=2\n\n# Second\nC=3\n")
	})

	test("skips a group whose keys are all absent and separates from existing body", () => {
		const groups = [
			{ comment: "First", keys: ["A"] },
			{ comment: "Second", keys: ["C"] },
		]
		const result = mergeEnv("EXISTING=keep\n", { A: "1" }, new Set(["A"]), groups)
		expect(result.content).toBe("EXISTING=keep\n\n# First\nA=1\n")
	})

	test("appends grouped keys but leaves ungrouped ones bare", () => {
		const groups = [{ comment: "First", keys: ["A"] }]
		const result = mergeEnv("", { A: "1", Z: "9" }, new Set(["A", "Z"]), groups)
		expect(result.content).toBe("# First\nA=1\nZ=9\n")
	})
})

describe("envKeysPresent", () => {
	test("reports declared keys and ignores commented or absent ones", () => {
		const contents = "A=1\n#B=2\n  C = 3\n"
		expect(envKeysPresent(contents, ["A", "B", "C", "D"])).toEqual(["A", "C"])
	})
})

describe("detectPackageManager", () => {
	const prevAgent = process.env.npm_config_user_agent

	beforeEach(() => {
		delete process.env.npm_config_user_agent
	})

	afterEach(() => {
		if (prevAgent === undefined) delete process.env.npm_config_user_agent
		else process.env.npm_config_user_agent = prevAgent
	})

	test.each([
		["pnpm-lock.yaml", "pnpm"],
		["yarn.lock", "yarn"],
		["bun.lock", "bun"],
		["package-lock.json", "npm"],
		["npm-shrinkwrap.json", "npm"],
	])("detects %s -> %s", async (lockfile, expected) => {
		fs.writeFileSync(path.join(dir, lockfile), "")
		expect(await detectPackageManager(dir)).toBe(expected)
	})

	test("reads the corepack packageManager field when there's no lockfile", async () => {
		fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ packageManager: "pnpm@9.0.0" }))
		expect(await detectPackageManager(dir)).toBe("pnpm")
	})

	test("a lockfile alone settles the manager", async () => {
		fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({}))
		fs.writeFileSync(path.join(dir, "pnpm-lock.yaml"), "")
		expect(await detectPackageManager(dir)).toBe("pnpm")
	})

	test("resolves a monorepo package to the workspace root's lockfile", async () => {
		fs.writeFileSync(path.join(dir, "pnpm-lock.yaml"), "")
		const pkgDir = path.join(dir, "packages", "app")
		fs.mkdirSync(pkgDir, { recursive: true })
		fs.writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify({ name: "app" }))
		expect(await detectPackageManager(pkgDir)).toBe("pnpm")
	})

	test("ignores an unsupported packageManager field", async () => {
		fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ packageManager: "cnpm@1.0.0" }))
		expect(await detectPackageManager(dir)).toBeUndefined()
	})

	test("does not guess from the invoking manager", async () => {
		process.env.npm_config_user_agent = "pnpm/9.0.0 npm/? node/v20.0.0 darwin arm64"
		expect(await detectPackageManager(dir)).toBeUndefined()
	})

	test("returns undefined without any project signal", async () => {
		expect(await detectPackageManager(dir)).toBeUndefined()
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
