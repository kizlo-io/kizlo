import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { resolveStackName } from "./config"

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
		expect(resolveStackName(dir, "my-app")).toBe("my-app")
	})

	test("turns a scoped name into scope-pkg and lowercases it", () => {
		expect(resolveStackName(dir, "@Acme/My_App")).toBe("acme-my_app")
	})

	test("strips characters outside [a-z0-9_-]", () => {
		expect(resolveStackName(dir, "My App! 2.0")).toBe("myapp20")
	})

	test("falls back to a safe id when sanitization leaves nothing", () => {
		expect(resolveStackName(dir, "@/")).toBe("kizlo")
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
