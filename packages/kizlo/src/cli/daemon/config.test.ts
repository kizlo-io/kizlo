import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { DEFAULT_WORDPRESS_TAG } from "../wp/constants"
import { resolveConfig, resolveDevConfig, resolveStackName, resolveTestConfig, stackProject, usesLocalWordPress } from "./config"
import { log } from "./logger"

describe("resolveStackName", () => {
	let dir: string

	beforeEach(() => {
		dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-name-")))
	})

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true })
	})

	test("uses the explicit config name over package.json", () => {
		fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "ignored" }))
		expect(resolveStackName(dir, { name: "my-app" })).toBe("my-app")
	})

	test("turns a scoped name into scope-pkg and lowercases it", () => {
		expect(resolveStackName(dir, { name: "@Acme/My_App" })).toBe("acme-my_app")
	})

	test("strips characters outside [a-z0-9_-]", () => {
		expect(resolveStackName(dir, { name: "My App! 2.0" })).toBe("myapp20")
	})

	test("falls back to a safe id when sanitization leaves nothing", () => {
		expect(resolveStackName(dir, { name: "@/" })).toBe("kizlo")
	})

	test("reads the package.json name when no config name is given", () => {
		fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "@scope/pkg" }))
		expect(resolveStackName(dir)).toBe("scope-pkg")
	})

	test("falls back to the config dir basename without a package.json name", () => {
		expect(resolveStackName(dir)).toBe(
			path
				.basename(dir)
				.toLowerCase()
				.replace(/[^a-z0-9_-]/g, ""),
		)
	})
})

describe("resolveStackName with worktrees", () => {
	let dir: string

	beforeEach(() => {
		dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-wt-")))
		fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "shop" }))
	})

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true })
	})

	/** A main checkout: `.git` is a directory holding HEAD. */
	function gitDir(branch: string): void {
		fs.mkdirSync(path.join(dir, ".git"), { recursive: true })
		fs.writeFileSync(path.join(dir, ".git", "HEAD"), `ref: refs/heads/${branch}\n`)
	}

	/** A linked worktree: `.git` is a file pointing at the main checkout's worktree metadata. */
	function gitFile(branch: string): string {
		const main = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-wt-main-"))
		const meta = path.join(main, ".git", "worktrees", "wt")
		fs.mkdirSync(meta, { recursive: true })
		fs.writeFileSync(path.join(meta, "HEAD"), `ref: refs/heads/${branch}\n`)
		fs.writeFileSync(path.join(dir, ".git"), `gitdir: ${meta}\n`)
		return main
	}

	test("leaves the name alone when the flag is off", () => {
		gitDir("main")
		expect(resolveStackName(dir)).toBe("shop")
		expect(resolveStackName(dir, { worktrees: false })).toBe("shop")
	})

	test("appends the branch of a main checkout", () => {
		gitDir("main")
		expect(resolveStackName(dir, { worktrees: true })).toBe("shop-main")
	})

	test("appends the branch of a linked worktree, whose .git is a file", () => {
		const main = gitFile("fix/kiz-70-derive")
		try {
			expect(resolveStackName(dir, { worktrees: true })).toBe("shop-fix-kiz-70-derive")
		} finally {
			fs.rmSync(main, { recursive: true, force: true })
		}
	})

	test("appends to an explicit config name rather than replacing it", () => {
		gitDir("main")
		expect(resolveStackName(dir, { name: "pinned", worktrees: true })).toBe("pinned-main")
	})

	test("keeps two projects on one branch apart", () => {
		gitDir("main")
		const other = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-wt-other-")))
		try {
			fs.writeFileSync(path.join(other, "package.json"), JSON.stringify({ name: "blog" }))
			fs.mkdirSync(path.join(other, ".git"), { recursive: true })
			fs.writeFileSync(path.join(other, ".git", "HEAD"), "ref: refs/heads/main\n")

			expect(resolveStackName(dir, { worktrees: true })).toBe("shop-main")
			expect(resolveStackName(other, { worktrees: true })).toBe("blog-main")
		} finally {
			fs.rmSync(other, { recursive: true, force: true })
		}
	})

	test("keeps the unsuffixed name on a detached HEAD", () => {
		fs.mkdirSync(path.join(dir, ".git"), { recursive: true })
		fs.writeFileSync(path.join(dir, ".git", "HEAD"), "9fceb02d0ae598e95dc970b74767f19372d61af8\n")
		expect(resolveStackName(dir, { worktrees: true })).toBe("shop")
	})

	test("keeps the unsuffixed name outside a repository", () => {
		expect(resolveStackName(dir, { worktrees: true })).toBe("shop")
	})

	test("sanitizes a branch name into a docker id", () => {
		gitDir("feat/KIZ-113_Stacks")
		expect(resolveStackName(dir, { worktrees: true })).toBe("shop-feat-kiz-113_stacks")
	})
})

describe("stackProject", () => {
	test("prefixes with kizlo- and suffixes with the kind", () => {
		expect(stackProject("my-app", "dev")).toBe("kizlo-my-app-dev")
		expect(stackProject("my-app", "test")).toBe("kizlo-my-app-test")
	})
})

describe("resolveConfig", () => {
	let dir: string

	beforeEach(() => {
		dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-dir-")))
	})

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true })
	})

	function writeConfig(body: string): void {
		fs.writeFileSync(path.join(dir, "kizlo.config.ts"), `export default ${body}\n`)
	}

	test("returns undefined when nothing is configured to generate", async () => {
		writeConfig('{ alias: "@/" }')
		expect(await resolveConfig(dir)).toBeUndefined()
	})

	test("resolves the server layout and introspection from a `dir` string", async () => {
		writeConfig('{ dir: "src/lib/kizlo" }')
		const cfg = await resolveConfig(dir)
		expect(cfg?.server).toEqual({
			dir: path.join("src/lib/kizlo", "server"),
			entry: path.join("src/lib/kizlo", "server", "index.ts"),
			contractDir: path.join("src/lib/kizlo", "server", "generated"),
			contractPath: path.join("src/lib/kizlo", "server", "generated", "contract.json"),
			barrelPath: path.join("src/lib/kizlo", "server", "generated", "index.ts"),
		})
		expect(cfg?.introspectionPath).toBe(path.join("src/lib/kizlo", "server", "generated", "introspection.ts"))
	})

	test("resolves an introspection path with no server from `dir: { introspection }`", async () => {
		writeConfig('{ dir: { introspection: "." } }')
		const cfg = await resolveConfig(dir)
		expect(cfg?.server).toBeUndefined()
		expect(cfg?.introspectionPath).toBe("introspection.ts")
	})

	test("takes the `--dir` flag over the config `dir`", async () => {
		writeConfig('{ dir: { introspection: "." } }')
		const cfg = await resolveConfig(dir, { dir: "packages/api" })
		expect(cfg?.server?.dir).toBe(path.join("packages/api", "server"))
	})

	test.each([
		["wordpressClientDir", '{ wordpressClientDir: "." }', "dir: { introspection }"],
		["root dev", "{ dev: { enable: true } }", "local.dev"],
		["root test", "{ test: { enable: true } }", "local.test"],
		["root name", '{ name: "shop" }', "local.name"],
		["root worktrees", "{ worktrees: true }", "local.worktrees"],
	])("rejects the removed key %s, naming its replacement", async (_label, body, replacement) => {
		const errors: string[] = []
		vi.spyOn(log, "error").mockImplementation((...args: unknown[]) => {
			errors.push(args.map(String).join(" "))
		})
		vi.spyOn(process, "exit").mockImplementation((() => {
			throw new Error("exit called")
		}) as never)

		writeConfig(body)
		await expect(resolveConfig(dir)).rejects.toThrow("exit called")
		expect(errors.join("\n")).toContain(replacement)
		vi.restoreAllMocks()
	})
})

describe("resolveDevConfig / resolveTestConfig", () => {
	let dir: string

	beforeEach(() => {
		dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-local-")))
	})

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true })
	})

	function writeConfig(body: string): void {
		fs.writeFileSync(path.join(dir, "kizlo.config.ts"), `export default ${body}\n`)
	}

	// A config body that defines two named fixtures inline, so the resolver sees real fixture objects
	// (validated by the schema on `name`) the way a project's own config would.
	const fixtureDefs = 'const a = { name: "fixture-a" }\nconst b = { name: "fixture-b" }\n'

	function writeFixtureConfig(local: string): void {
		fs.writeFileSync(path.join(dir, "kizlo.config.ts"), `${fixtureDefs}export default { local: ${local} }\n`)
	}

	test("boots current WordPress when no version is configured", async () => {
		// An unconfigured project gets current WordPress; a version baked into Kizlo would
		// otherwise decide for every consumer at the moment Kizlo was published.
		expect(DEFAULT_WORDPRESS_TAG).toBe("latest")

		writeConfig("{ local: true }")
		expect((await resolveDevConfig(dir)).wordpressTag).toBe(DEFAULT_WORDPRESS_TAG)
		expect((await resolveTestConfig(dir)).wordpressTag).toBe(DEFAULT_WORDPRESS_TAG)
	})

	test("reads the dev and test stacks under `local`", async () => {
		writeConfig('{ local: { dev: { version: "7.1.0" }, test: { version: "6.8.2" } } }')
		expect((await resolveDevConfig(dir)).wordpressTag).toBe("7.1.0")
		expect((await resolveTestConfig(dir)).wordpressTag).toBe("6.8.2")
	})

	test("the test stack inherits the dev version and fixtures when it omits them", async () => {
		writeFixtureConfig('{ dev: { version: "7.1.0", fixtures: [a, b] }, test: {} }')
		const test = await resolveTestConfig(dir)
		expect(test.wordpressTag).toBe("7.1.0")
		expect(test.fixtures.map((f) => f.name)).toEqual(["fixture-a", "fixture-b"])
	})

	test("explicit test version and fixtures win over the dev stack", async () => {
		writeFixtureConfig('{ dev: { version: "7.1.0", fixtures: [a] }, test: { version: "6.8.2", fixtures: [b] } }')
		const test = await resolveTestConfig(dir)
		expect(test.wordpressTag).toBe("6.8.2")
		expect(test.fixtures.map((f) => f.name)).toEqual(["fixture-b"])
	})

	test("an explicit empty fixtures array seeds nothing, overriding the dev stack", async () => {
		writeFixtureConfig("{ dev: { fixtures: [a, b] }, test: { fixtures: [] } }")
		expect((await resolveTestConfig(dir)).fixtures).toEqual([])
	})

	test("`inherit: false` ignores the dev stack and takes Kizlo's defaults", async () => {
		writeFixtureConfig('{ dev: { version: "7.1.0", fixtures: [a, b] }, test: { inherit: false } }')
		const test = await resolveTestConfig(dir)
		expect(test.wordpressTag).toBe(DEFAULT_WORDPRESS_TAG)
		expect(test.fixtures).toEqual([])
	})

	test.each([
		["both stacks on", "{ dev: {}, test: {} }", true, true],
		["dev off", "{ dev: { enable: false }, test: {} }", false, true],
		["test off", "{ dev: {}, test: { enable: false } }", true, false],
		["local off", "false", false, false],
		["local disabled by enable", "{ enable: false, dev: {}, test: {} }", false, false],
	])("resolves local booleans: %s", async (_label, local, dev, test) => {
		writeConfig(`{ local: ${local} }`)
		expect(await usesLocalWordPress(dir)).toBe(dev)
		expect((await resolveTestConfig(dir)).local).toBe(test)
	})

	test("reads the stack name and worktrees from `local`", async () => {
		fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "ignored" }))
		writeConfig('{ local: { name: "shop", dev: {}, test: {} } }')
		expect((await resolveDevConfig(dir)).project).toBe("kizlo-shop-dev")
		expect((await resolveTestConfig(dir)).project).toBe("kizlo-shop-test")
	})

	test("a set dev port leaves the test port at its default", async () => {
		writeConfig("{ local: { dev: { port: 9090 }, test: {} } }")
		expect((await resolveDevConfig(dir)).port).toBe(9090)
		expect((await resolveTestConfig(dir)).port).toBe(8889)
	})

	test("a set dev dbPort never reaches the test config", async () => {
		writeConfig("{ local: { dev: { dbPort: 3399 }, test: {} } }")
		expect((await resolveDevConfig(dir)).dbPort).toBe(3399)
		// The test config has no dbPort field at all — the dev-only key cannot leak into it.
		expect("dbPort" in (await resolveTestConfig(dir))).toBe(false)
	})

	test("takes a full tag, for a caller pinning a specific PHP", async () => {
		writeConfig('{ local: { test: { version: "6.8.2-php8.3-apache" } } }')
		expect((await resolveTestConfig(dir)).wordpressTag).toBe("6.8.2-php8.3-apache")
	})
})
