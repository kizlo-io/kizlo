import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { githubRelease, kizloRelease } from "./constants"
import type { Fixture, SettleContext } from "./types"
import { isLocalPlugin } from "./types"
import { credentialsPath, findConfigDir, recordedPort, resolvePluginSource, settleFixtures } from "./utils"

describe("githubRelease", () => {
	test("builds a release-zip URL where the asset is named after the tag", () => {
		expect(githubRelease("kizlo-io/kizlo", "kizlo-v1.0.0")).toBe(
			"https://github.com/kizlo-io/kizlo/releases/download/kizlo-v1.0.0/kizlo-v1.0.0.zip",
		)
	})
})

describe("kizloRelease", () => {
	test("builds the kizlo.io latest-download URL for a plugin slug", () => {
		expect(kizloRelease("kizlo")).toBe("https://kizlo.io/plugins/kizlo/download")
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
		expect(credentialsPath(nested)).toBe(path.join(dir, ".kizlo", "test.json"))
	})
})

describe("recordedPort", () => {
	let dir: string
	let cwd: string

	beforeEach(() => {
		cwd = process.cwd()
		dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-port-")))
		fs.writeFileSync(path.join(dir, "kizlo.config.ts"), "export default {}\n")
		process.chdir(dir)
	})

	afterEach(() => {
		process.chdir(cwd)
		fs.rmSync(dir, { recursive: true, force: true })
	})

	function writeCredentials(credentials: Record<string, unknown>): void {
		fs.mkdirSync(path.join(dir, ".kizlo"), { recursive: true })
		fs.writeFileSync(path.join(dir, ".kizlo", "test.json"), JSON.stringify(credentials))
	}

	test("reads the port out of the recorded url", () => {
		writeCredentials({ url: "http://localhost:8889", project: "kizlo-shop-main-test" })
		expect(recordedPort("kizlo-shop-main-test")).toBe(8889)
	})

	test("ignores a port another stack recorded", () => {
		writeCredentials({ url: "http://localhost:8889", project: "kizlo-shop-main-test" })
		expect(recordedPort("kizlo-shop-fix-checkout-test")).toBeUndefined()
	})

	test("ignores an artifact written before stacks were recorded", () => {
		writeCredentials({ url: "http://localhost:8889" })
		expect(recordedPort("kizlo-shop-main-test")).toBeUndefined()
	})

	test("is undefined when nothing has been seeded here", () => {
		expect(recordedPort("kizlo-shop-main-test")).toBeUndefined()
	})
})

describe("settleFixtures", () => {
	function context(calls: string[]): SettleContext {
		return {
			wpCli: async (args) => {
				calls.push(`cli:${args.join(" ")}`)
				return ""
			},
			wpEval: async (php) => {
				calls.push(`eval:${php}`)
				return ""
			},
		}
	}

	test("settles each fixture that asks to, in fixture order", async () => {
		const calls: string[] = []
		const fixtures: Fixture[] = [
			{ name: "woocommerce", settle: async ({ wpEval }) => void (await wpEval("first")) },
			{ name: "cf7", settle: async ({ wpEval }) => void (await wpEval("second")) },
		]

		await settleFixtures(fixtures, context(calls))

		expect(calls).toEqual(["eval:first", "eval:second"])
	})

	test("leaves a fixture with nothing to settle alone", async () => {
		const calls: string[] = []

		await settleFixtures([{ name: "kizlo-core" }], context(calls))

		expect(calls).toEqual([])
	})

	test("accepts a config that declares no fixtures at all", async () => {
		const calls: string[] = []

		await expect(settleFixtures(undefined, context(calls))).resolves.toBeUndefined()
		expect(calls).toEqual([])
	})
})
