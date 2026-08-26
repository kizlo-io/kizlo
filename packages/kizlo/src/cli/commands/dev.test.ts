import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { syncLocalUrl } from "./dev"

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
