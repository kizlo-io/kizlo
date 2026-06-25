import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { isLocalPlugin } from "./types"
import { credentialsPath, findConfigDir, githubRelease, resolvePluginSource } from "./utils"

describe("githubRelease", () => {
	test("builds a release-zip URL where the asset is named after the tag", () => {
		expect(githubRelease("kizlo-io/kizlo-wordpress", "kizlo-v1.0.0")).toBe(
			"https://github.com/kizlo-io/kizlo-wordpress/releases/download/kizlo-v1.0.0/kizlo-v1.0.0.zip",
		)
	})
})

describe("resolvePluginSource", () => {
	test("treats a bare string as both name and source (wp.org slug)", () => {
		expect(resolvePluginSource("contact-form-7")).toEqual(["contact-form-7", "contact-form-7"])
	})

	test("keeps name and source distinct for the object form", () => {
		expect(resolvePluginSource({ name: "kizlo", source: "https://example.com/kizlo.zip" })).toEqual([
			"kizlo",
			"https://example.com/kizlo.zip",
		])
	})
})

describe("isLocalPlugin", () => {
	test("is true only for the { path } mount form", () => {
		expect(isLocalPlugin({ path: "plugins/kizlo" })).toBe(true)
	})

	test("is false for a wp.org slug and a { name, source } install", () => {
		expect(isLocalPlugin("woocommerce")).toBe(false)
		expect(isLocalPlugin({ name: "kizlo", source: "https://example.com/kizlo.zip" })).toBe(false)
	})
})

describe("findConfigDir", () => {
	let dir: string

	beforeEach(() => {
		dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-cfg-")))
	})

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true })
	})

	test("walks up to the directory holding kizlo.config.*", () => {
		fs.writeFileSync(path.join(dir, "kizlo.config.ts"), "")
		const nested = path.join(dir, "apps", "web")
		fs.mkdirSync(nested, { recursive: true })
		expect(findConfigDir(nested)).toBe(dir)
	})

	test("falls back to the starting directory when no config is found", () => {
		const nested = path.join(dir, "apps", "web")
		fs.mkdirSync(nested, { recursive: true })
		expect(findConfigDir(nested)).toBe(nested)
	})

	test("anchors the credentials artifact to the config dir, not the cwd", () => {
		fs.writeFileSync(path.join(dir, "kizlo.config.ts"), "")
		const nested = path.join(dir, "apps", "web")
		fs.mkdirSync(nested, { recursive: true })
		expect(credentialsPath(nested)).toBe(path.join(dir, ".kizlo", "test-credentials.json"))
	})
})
