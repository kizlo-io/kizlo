import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { resolveStackName, stackProject } from "./config"

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
