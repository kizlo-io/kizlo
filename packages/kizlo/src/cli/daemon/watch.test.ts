import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test, vi } from "vitest"
import { INTROSPECTION_FIXTURE } from "../../wordpress/introspection.fixture"
import type { WordPressCredentials } from "../../wordpress/types"
import type { ResolvedConfig } from "./config"
import { log } from "./logger"
import { createWordPressRefresh } from "./watch"

const CREDENTIALS: WordPressCredentials = { url: "https://wp.example", username: "admin", password: "secret" }

/** A workspace carrying only the generated client, the lighter of the two shapes the poll refreshes. */
const CLIENT_DIR = "src/generated"

afterEach(() => {
	vi.restoreAllMocks()
})

function workspace(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-watch-"))
}

/** Every line the CLI said through `method`, one entry per call. */
function lines(method: "error" | "success"): string[] {
	return (log[method] as unknown as ReturnType<typeof vi.fn>).mock.calls.map((call: unknown[]) => call.join(" "))
}

function watchLog(): void {
	vi.spyOn(log, "error").mockImplementation(() => {})
	vi.spyOn(log, "success").mockImplementation(() => {})
	vi.spyOn(log, "warn").mockImplementation(() => {})
}

function refusing(message: string): typeof globalThis.fetch {
	return vi.fn(() => Promise.reject(new Error(message))) as unknown as typeof globalThis.fetch
}

function serving(): typeof globalThis.fetch {
	return vi.fn(async () => Response.json(INTROSPECTION_FIXTURE, { headers: { etag: '"fixture"' } })) as unknown as typeof globalThis.fetch
}

/** An app carrying its own service, written somewhere the workspace client will not land on. */
function config(cwd: string): ResolvedConfig {
	return {
		cwd,
		dir: "kizlo",
		serverDir: "src/server",
		serverEntry: "src/server/index.ts",
		generatedDir: "src/service",
		contractPath: "src/service/contract.json",
		barrelPath: "src/service/index.ts",
		wordpressPath: "src/service/wordpress.ts",
		wordpressMetaPath: ".kizlo/wordpress.json",
	}
}

/** A refresh whose transport can be swapped between passes, the way a poll's answer changes under it. */
function poll(cwd: string, cfg?: ResolvedConfig): (fetch: typeof globalThis.fetch) => Promise<void> {
	let current: typeof globalThis.fetch = serving()
	const refresh = createWordPressRefresh(cwd, cfg, CLIENT_DIR, {
		credentials: CREDENTIALS,
		fetch: ((input, init) => current(input, init)) as typeof globalThis.fetch,
	})
	return async (fetch) => {
		current = fetch
		await refresh()
	}
}

describe("createWordPressRefresh", () => {
	test("reports a failure it cannot clear once, however many passes hit it", async () => {
		watchLog()
		const pass = poll(workspace())

		for (let attempt = 0; attempt < 4; attempt++) await pass(refusing("offline"))

		expect(lines("error")).toHaveLength(1)
		expect(lines("error")[0]).toContain("Failed to update the WordPress client:")
	})

	test("reports again when the failure changes", async () => {
		watchLog()
		const pass = poll(workspace())

		await pass(refusing("offline"))
		await pass(refusing("offline"))
		await pass(refusing("connection refused"))
		await pass(refusing("connection refused"))

		const errors = lines("error")
		expect(errors).toHaveLength(2)
		expect(errors[0]).toContain("offline")
		expect(errors[1]).toContain("connection refused")
	})

	test("says the poll recovered, and reports the next failure as new", async () => {
		watchLog()
		const pass = poll(workspace())

		await pass(refusing("offline"))
		await pass(refusing("offline"))
		await pass(serving())

		expect(lines("success")).toContain("Updating the WordPress client again")

		await pass(refusing("offline"))
		expect(lines("error")).toHaveLength(2)
	})

	test("stays silent about recovery for a poll that never failed", async () => {
		watchLog()
		const pass = poll(workspace())

		await pass(serving())
		await pass(serving())

		expect(lines("error")).toHaveLength(0)
		expect(lines("success")).not.toContain("Updating the WordPress client again")
	})

	test("names each generation in its own failure, and repeats neither", async () => {
		watchLog()
		const cwd = workspace()
		const pass = poll(cwd, config(cwd))

		await pass(refusing("offline"))
		await pass(refusing("offline"))

		const errors = lines("error")
		expect(errors).toHaveLength(2)
		expect(errors[0]).toContain("Failed to update the WordPress service:")
		expect(errors[1]).toContain("Failed to update the WordPress client:")
	})
})
