import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { runCommand } from "citty"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ exportDev: vi.fn(), watcher: vi.fn() }))
vi.mock("../wp/export", () => ({ exportDev: mocks.exportDev }))
vi.mock("../daemon/watch", () => ({ startWatcher: mocks.watcher }))
vi.mock("../daemon/config", async (original) => ({
	...(await original<typeof import("../daemon/config")>()),
	usesLocalWordPress: async () => false,
}))

import { dev, syncLocalUrl } from "./dev"

describe("syncLocalUrl", () => {
	let dir: string

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-dev-url-"))
	})

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true })
	})

	test("replaces a stale local URL without changing remote or unrelated values", () => {
		const envPath = path.join(dir, ".env")
		fs.writeFileSync(
			envPath,
			[
				"KIZLO_MODE=local",
				"KIZLO_LOCAL_WP_URL=http://192.168.0.5:8080",
				"KIZLO_LOCAL_WP_USERNAME=local-user",
				"KIZLO_WP_URL=https://wp.example.com",
				"KIZLO_WP_USERNAME=remote-user",
				"UNRELATED=value",
				"",
			].join("\n"),
		)

		expect(syncLocalUrl(dir, "http://192.168.0.9:8080")).toBe(true)
		expect(fs.readFileSync(envPath, "utf8")).toBe(
			[
				"KIZLO_MODE=local",
				"KIZLO_LOCAL_WP_URL=http://192.168.0.9:8080",
				"KIZLO_LOCAL_WP_USERNAME=local-user",
				"KIZLO_WP_URL=https://wp.example.com",
				"KIZLO_WP_USERNAME=remote-user",
				"UNRELATED=value",
				"",
			].join("\n"),
		)
	})

	test("leaves an already-current URL unchanged", () => {
		const envPath = path.join(dir, ".env")
		const existing = "KIZLO_LOCAL_WP_URL=http://192.168.0.9:8080\n"
		fs.writeFileSync(envPath, existing)

		expect(syncLocalUrl(dir, "http://192.168.0.9:8080")).toBe(false)
		expect(fs.readFileSync(envPath, "utf8")).toBe(existing)
	})

	test("does not create an env file before setup", () => {
		expect(syncLocalUrl(dir, "http://192.168.0.9:8080")).toBe(false)
		expect(fs.existsSync(path.join(dir, ".env"))).toBe(false)
	})
})

describe("dev command routing", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.exportDev.mockResolvedValue("/tmp/export.zip")
		mocks.watcher.mockResolvedValue(undefined)
	})
	test("export is one-shot and starts no watcher", async () => {
		await runCommand(dev, { rawArgs: ["--export"] })
		expect(mocks.exportDev).toHaveBeenCalledOnce()
		expect(mocks.watcher).not.toHaveBeenCalled()
	})
	test.each([
		["stop", "--export"],
		["--export", "stop"],
		["reset", "--export"],
		["--export", "reset"],
	])("rejects combined arguments %j", async (...rawArgs) => {
		await expect(runCommand(dev, { rawArgs })).rejects.toThrow("cannot be combined")
		expect(mocks.exportDev).not.toHaveBeenCalled()
		expect(mocks.watcher).not.toHaveBeenCalled()
	})
	test("bare dev retains the watcher path", async () => {
		await runCommand(dev, { rawArgs: [] })
		expect(mocks.watcher).toHaveBeenCalledOnce()
		expect(mocks.exportDev).not.toHaveBeenCalled()
	})
	test("stop and reset do not run the parent default", async () => {
		await runCommand(dev, { rawArgs: ["stop"] })
		await runCommand(dev, { rawArgs: ["reset"] })
		expect(mocks.watcher).not.toHaveBeenCalled()
		expect(mocks.exportDev).not.toHaveBeenCalled()
	})
})
