import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import {
	addDependencyArgs,
	approveBuildsCommand,
	availablePackageManagers,
	detectImportAlias,
	detectInvokingPackageManager,
	detectPackageManager,
	ensureGitignored,
	envKeysPresent,
	frameworkCreateArgs,
	initGitRepository,
	isCommandAvailable,
	isGitRepository,
	mergeEnv,
	persistPackageManagerField,
	readPersistedAlias,
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

describe("readPersistedAlias", () => {
	test("returns undefined when there is no kizlo.config", () => {
		expect(readPersistedAlias(dir)).toBeUndefined()
	})

	test("returns undefined when the config declares no alias (choice never made)", () => {
		fs.writeFileSync(path.join(dir, "kizlo.config.ts"), 'export default defineConfig({\n\tdir: "src/lib/kizlo",\n})\n')
		expect(readPersistedAlias(dir)).toBeUndefined()
	})

	test("reads a persisted alias prefix", () => {
		fs.writeFileSync(path.join(dir, "kizlo.config.ts"), 'export default defineConfig({\n\tdir: "src/lib/kizlo",\n\talias: "@/",\n})\n')
		expect(readPersistedAlias(dir)).toBe("@/")
	})

	test("reads an empty alias as the recorded relative-imports choice", () => {
		// An empty string is a made decision (relative imports), distinct from an absent key — so a re-run
		// reuses it and never re-prompts.
		fs.writeFileSync(path.join(dir, "kizlo.config.ts"), 'export default defineConfig({\n\tdir: "src/lib/kizlo",\n\talias: "",\n})\n')
		expect(readPersistedAlias(dir)).toBe("")
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
	])("detects %s -> %s", (lockfile, expected) => {
		fs.writeFileSync(path.join(dir, lockfile), "")
		expect(detectPackageManager(dir)).toBe(expected)
	})

	test("reads the corepack packageManager field when there's no lockfile", () => {
		fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ packageManager: "pnpm@9.0.0" }))
		expect(detectPackageManager(dir)).toBe("pnpm")
	})

	test("a lockfile beats the packageManager field", () => {
		fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ packageManager: "npm@10.0.0" }))
		fs.writeFileSync(path.join(dir, "pnpm-lock.yaml"), "")
		expect(detectPackageManager(dir)).toBe("pnpm")
	})

	test("ignores an unsupported packageManager field", () => {
		fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ packageManager: "cnpm@1.0.0" }))
		expect(detectPackageManager(dir)).toBeUndefined()
	})

	test("does not guess from the invoking manager", () => {
		process.env.npm_config_user_agent = "pnpm/9.0.0 npm/? node/v20.0.0 darwin arm64"
		expect(detectPackageManager(dir)).toBeUndefined()
	})

	test("returns undefined without any project signal", () => {
		expect(detectPackageManager(dir)).toBeUndefined()
	})
})

describe("persistPackageManagerField", () => {
	test("stamps the field so a later detect settles on it", () => {
		const pkgPath = path.join(dir, "package.json")
		fs.writeFileSync(pkgPath, JSON.stringify({ name: "app" }))
		persistPackageManagerField(dir, "npm")
		const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { packageManager?: string }
		expect(pkg.packageManager?.startsWith("npm")).toBe(true)
		expect(detectPackageManager(dir)).toBe("npm")
	})

	test("leaves an existing field untouched", () => {
		const pkgPath = path.join(dir, "package.json")
		fs.writeFileSync(pkgPath, JSON.stringify({ packageManager: "yarn@4.0.0" }))
		persistPackageManagerField(dir, "npm")
		const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { packageManager?: string }
		expect(pkg.packageManager).toBe("yarn@4.0.0")
	})

	test("preserves the file's indentation", () => {
		const pkgPath = path.join(dir, "package.json")
		fs.writeFileSync(pkgPath, `${JSON.stringify({ name: "app" }, null, 2)}\n`)
		persistPackageManagerField(dir, "npm")
		expect(fs.readFileSync(pkgPath, "utf8")).toContain('\n  "packageManager":')
	})

	test("is a no-op when there's no package.json", () => {
		expect(() => persistPackageManagerField(dir, "npm")).not.toThrow()
		expect(fs.existsSync(path.join(dir, "package.json"))).toBe(false)
	})
})

describe("detectInvokingPackageManager", () => {
	const prev = process.env.npm_config_user_agent

	afterEach(() => {
		if (prev === undefined) delete process.env.npm_config_user_agent
		else process.env.npm_config_user_agent = prev
	})

	test.each([
		["pnpm/9.0.0 npm/? node/v20.0.0 darwin arm64", "pnpm"],
		["yarn/1.22.19 npm/? node/v20.0.0", "yarn"],
		["bun/1.1.0 npm/? node/v20.0.0", "bun"],
		["npm/10.0.0 node/v20.0.0", "npm"],
	])("reads %s -> %s", (agent, expected) => {
		process.env.npm_config_user_agent = agent
		expect(detectInvokingPackageManager()).toBe(expected)
	})

	test("returns undefined when the agent is absent", () => {
		delete process.env.npm_config_user_agent
		expect(detectInvokingPackageManager()).toBeUndefined()
	})

	test("returns undefined for an unknown agent", () => {
		process.env.npm_config_user_agent = "cnpm/1.0.0"
		expect(detectInvokingPackageManager()).toBeUndefined()
	})
})

describe("isCommandAvailable", () => {
	test("resolves a runnable executable", () => {
		expect(isCommandAvailable("node")).toBe(true)
	})

	test("reports a missing executable as unavailable", () => {
		expect(isCommandAvailable("kizlo-not-a-real-binary")).toBe(false)
	})
})

describe("availablePackageManagers", () => {
	test("keeps only installed managers, preserving order", () => {
		// npm ships with the Node.js that runs this suite, so it is always present.
		const result = availablePackageManagers(["pnpm", "npm", "yarn", "bun"])
		expect(result).toContain("npm")
		expect(result).toEqual(["pnpm", "npm", "yarn", "bun"].filter((pm) => result.includes(pm as never)))
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

	test("dev uses --save-dev on npm and --dev elsewhere", () => {
		expect(addDependencyArgs("npm", "kizlo", { dev: true })).toEqual(["npm", "install", "kizlo", "--save-dev"])
		expect(addDependencyArgs("pnpm", "kizlo", { dev: true })).toEqual(["pnpm", "add", "kizlo", "--dev"])
		expect(addDependencyArgs("yarn", "kizlo", { dev: true })).toEqual(["yarn", "add", "kizlo", "--dev"])
		expect(addDependencyArgs("bun", "kizlo", { dev: true })).toEqual(["bun", "add", "kizlo", "--dev"])
	})
})

describe("approveBuildsCommand", () => {
	const pnpmWarning = 'Ignored build scripts: better-sqlite3, esbuild.\nRun "pnpm approve-builds" to pick which dependencies should run scripts.'
	const bunWarning = "1 package installed [468.00ms]\n\nBlocked 3 postinstalls. Run `bun pm untrusted` for details."

	test("returns the pnpm approval command when pnpm blocked build scripts", () => {
		expect(approveBuildsCommand("pnpm", pnpmWarning)).toBe("pnpm approve-builds")
	})

	test("returns the bun trust command when bun blocked postinstalls", () => {
		expect(approveBuildsCommand("bun", bunWarning)).toBe("bun pm trust --all")
	})

	test("matches each manager's warning regardless of case", () => {
		expect(approveBuildsCommand("pnpm", "ignored build scripts: sharp.")).toBe("pnpm approve-builds")
		expect(approveBuildsCommand("bun", "blocked 1 postinstall.")).toBe("bun pm trust --all")
	})

	test("returns undefined when the output has no blocked-scripts warning", () => {
		expect(approveBuildsCommand("pnpm", "Done in 3s")).toBeUndefined()
		expect(approveBuildsCommand("bun", "2 packages installed [468.00ms]")).toBeUndefined()
	})

	test("returns undefined for managers that run scripts on install (npm, yarn)", () => {
		// A blocked-scripts warning from one manager never triggers another's command.
		expect(approveBuildsCommand("npm", pnpmWarning)).toBeUndefined()
		expect(approveBuildsCommand("yarn", pnpmWarning)).toBeUndefined()
		expect(approveBuildsCommand("npm", bunWarning)).toBeUndefined()
	})
})

describe("frameworkCreateArgs", () => {
	const flags = ["--ts", "--app"]

	test("npm forwards initializer flags after a -- separator", () => {
		expect(frameworkCreateArgs("npm", "next-app@latest", "my-app", flags)).toEqual([
			"npm",
			"create",
			"next-app@latest",
			"my-app",
			"--",
			"--ts",
			"--app",
		])
	})

	test("yarn drops the @latest tag and passes flags directly", () => {
		expect(frameworkCreateArgs("yarn", "next-app@latest", "my-app", flags)).toEqual([
			"yarn",
			"create",
			"next-app",
			"my-app",
			"--ts",
			"--app",
		])
	})

	test("pnpm and bun pass the tagged initializer and flags directly", () => {
		expect(frameworkCreateArgs("pnpm", "next-app@latest", "my-app", flags)).toEqual([
			"pnpm",
			"create",
			"next-app@latest",
			"my-app",
			"--ts",
			"--app",
		])
		expect(frameworkCreateArgs("bun", "next-app@latest", "my-app", flags)).toEqual([
			"bun",
			"create",
			"next-app@latest",
			"my-app",
			"--ts",
			"--app",
		])
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

describe("isGitRepository / initGitRepository", () => {
	test("a fresh directory is not a repo until initialized", () => {
		expect(isGitRepository(dir)).toBe(false)

		expect(initGitRepository(dir)).toBe(true)

		expect(isGitRepository(dir)).toBe(true)
		expect(fs.existsSync(path.join(dir, ".git"))).toBe(true)
	})

	test("stages the working tree and commits when an identity is available", () => {
		fs.writeFileSync(path.join(dir, "file.txt"), "hi\n")
		initGitRepository(dir)

		// The commit needs a configured user.name/email; where one exists (as here) the file lands in an
		// "Initial commit". On a machine without an identity the commit is skipped, so only assert when it
		// actually produced a log — the repo is still initialized either way.
		const log = spawnSync("git", ["log", "--oneline"], { cwd: dir, encoding: "utf8" })
		if (log.status === 0) expect(log.stdout).toContain("Initial commit")
	})
})
