import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test, vi } from "vitest"
import { INTROSPECTION_FIXTURE } from "../../wordpress/introspection.fixture"
import type { WordPressCredentials } from "../../wordpress/types"
import type { ResolvedConfig } from "./config"
import { lockPath } from "./lock"
import { log } from "./logger"
import { createWordPressRefresh, type StackWatch, startWatcher } from "./watch"

const SKIPPED = "Watcher already running — skipping the contract watcher."

const CREDENTIALS: WordPressCredentials = { url: "https://wp.example", username: "admin", password: "secret" }

afterEach(() => {
	vi.restoreAllMocks()
	vi.unstubAllEnvs()
})

function workspace(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-watch-"))
}

/** Every line the CLI said through `method`, one entry per call. */
function lines(method: "error" | "success" | "info"): string[] {
	return (log[method] as unknown as ReturnType<typeof vi.fn>).mock.calls.map((call: unknown[]) => call.join(" "))
}

function watchLog(): void {
	vi.spyOn(log, "error").mockImplementation(() => {})
	vi.spyOn(log, "success").mockImplementation(() => {})
	vi.spyOn(log, "warn").mockImplementation(() => {})
	vi.spyOn(log, "info").mockImplementation(() => {})
}

function refusing(message: string): typeof globalThis.fetch {
	return vi.fn(() => Promise.reject(new Error(message))) as unknown as typeof globalThis.fetch
}

function serving(): typeof globalThis.fetch {
	return vi.fn(async () => Response.json(INTROSPECTION_FIXTURE, { headers: { etag: '"fixture"' } })) as unknown as typeof globalThis.fetch
}

/** A package with only the introspection — the lighter of the two shapes the poll refreshes. */
function standalone(cwd: string): ResolvedConfig {
	return {
		cwd,
		introspectionPath: "src/generated/introspection.ts",
		introspectionMetaPath: ".kizlo/introspection.meta.json",
	}
}

/** An app carrying its own server next to the introspection. */
function config(cwd: string): ResolvedConfig {
	return {
		cwd,
		server: {
			dir: "src/server",
			entry: "src/server/index.ts",
			contractDir: "src/service",
			contractPath: "src/service/contract.json",
			barrelPath: "src/service/index.ts",
		},
		introspectionPath: "src/service/introspection.ts",
		introspectionMetaPath: ".kizlo/introspection.meta.json",
	}
}

/** A transport that answers, the way WordPress does when it is up but unwilling. */
function answering(response: () => Response): typeof globalThis.fetch {
	return vi.fn(async () => response()) as unknown as typeof globalThis.fetch
}

/** A refresh whose transport can be swapped between passes, the way a poll's answer changes under it. */
function poll(cwd: string, cfg: ResolvedConfig = standalone(cwd), stack?: StackWatch): (fetch: typeof globalThis.fetch) => Promise<void> {
	let current: typeof globalThis.fetch = serving()
	const refresh = createWordPressRefresh(
		cfg,
		{
			credentials: CREDENTIALS,
			fetch: ((input, init) => current(input, init)) as typeof globalThis.fetch,
		},
		stack,
	)
	return async (fetch) => {
		current = fetch
		await refresh()
	}
}

/** A stack watch reporting a fixed status, recording how often it was asked and whether it ended the session. */
function watching(status: "running" | "stopped" | "unknown"): {
	status: ReturnType<typeof vi.fn>
	onStopped: ReturnType<typeof vi.fn>
} & StackWatch {
	return { status: vi.fn(async () => status), onStopped: vi.fn() }
}

describe("createWordPressRefresh", () => {
	test("reports a failure it cannot clear once, however many passes hit it", async () => {
		watchLog()
		const pass = poll(workspace())

		for (let attempt = 0; attempt < 4; attempt++) await pass(refusing("offline"))

		expect(lines("error")).toHaveLength(1)
		expect(lines("error")[0]).toContain("Failed to update the WordPress introspection:")
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

		expect(lines("success")).toContain("Updating the WordPress introspection again")

		await pass(refusing("offline"))
		expect(lines("error")).toHaveLength(2)
	})

	test("stays silent about recovery for a poll that never failed", async () => {
		watchLog()
		const pass = poll(workspace())

		await pass(serving())
		await pass(serving())

		expect(lines("error")).toHaveLength(0)
		expect(lines("success")).not.toContain("Updating the WordPress introspection again")
	})

	test("ends the session when nothing answered and the stack has stopped", async () => {
		watchLog()
		const cwd = workspace()
		const stack = watching("stopped")
		const pass = poll(cwd, standalone(cwd), stack)

		await pass(refusing("fetch failed"))

		expect(stack.onStopped).toHaveBeenCalledTimes(1)
		expect(lines("error")).toEqual(["Local WordPress is no longer running. Ending the dev session."])
	})

	test("keeps retrying when nothing answered but the stack is still up", async () => {
		watchLog()
		const cwd = workspace()
		const stack = watching("running")
		const pass = poll(cwd, standalone(cwd), stack)

		await pass(refusing("fetch failed"))
		await pass(refusing("fetch failed"))
		await pass(serving())

		expect(stack.onStopped).not.toHaveBeenCalled()
		expect(lines("error")[0]).toContain("Failed to update the WordPress introspection:")
		expect(lines("success")).toContain("Updating the WordPress introspection again")
	})

	test("keeps retrying when docker could not say whether the stack is up", async () => {
		watchLog()
		const cwd = workspace()
		const stack = watching("unknown")
		const pass = poll(cwd, standalone(cwd), stack)

		await pass(refusing("fetch failed"))

		expect(stack.onStopped).not.toHaveBeenCalled()
		expect(lines("error")[0]).toContain("Failed to update the WordPress introspection:")
	})

	test.each([
		["WordPress refuses the request", () => new Response("no", { status: 403 })],
		["WordPress answers with something that will not parse", () => new Response("<html>", { status: 200 })],
	])("never ends the session when %s", async (_case, response) => {
		watchLog()
		const cwd = workspace()
		const stack = watching("stopped")
		const pass = poll(cwd, standalone(cwd), stack)

		await pass(answering(response))

		expect(stack.onStopped).not.toHaveBeenCalled()
		expect(lines("error")[0]).toContain("Failed to update the WordPress introspection:")
	})

	test("asks docker once while the poll goes on failing", async () => {
		watchLog()
		const cwd = workspace()
		const stack = watching("running")
		const pass = poll(cwd, standalone(cwd), stack)

		await pass(refusing("fetch failed"))
		await pass(refusing("fetch failed"))
		await pass(refusing("fetch failed"))

		expect(stack.status).toHaveBeenCalledTimes(1)
	})

	test("asks again on the first failure after WordPress answered", async () => {
		watchLog()
		const cwd = workspace()
		const stack = watching("running")
		const pass = poll(cwd, standalone(cwd), stack)

		await pass(refusing("fetch failed"))
		await pass(serving())
		await pass(refusing("fetch failed"))

		expect(stack.status).toHaveBeenCalledTimes(2)
	})

	test("refreshes the introspection for a server-backed app too", async () => {
		watchLog()
		const cwd = workspace()
		const pass = poll(cwd, config(cwd))

		await pass(refusing("offline"))
		await pass(refusing("offline"))

		const errors = lines("error")
		expect(errors).toHaveLength(1)
		expect(errors[0]).toContain("Failed to update the WordPress introspection:")
	})
})

/**
 * A workspace the watcher can start in but never finish starting in. The config carries it past the
 * "nothing to generate" exit, and the blank credentials make `resolveWordPressConnection` throw on
 * the next line, which is the first thing to run after the lock is taken.
 */
function unstartable(): string {
	const cwd = workspace()
	fs.writeFileSync(path.join(cwd, "kizlo.config.ts"), `export default { dir: { introspection: "." } }\n`)
	for (const key of ["KIZLO_MODE", "KIZLO_WP_URL", "KIZLO_WP_USERNAME", "KIZLO_WP_APP_PASSWORD"]) {
		vi.stubEnv(key, "")
	}
	return cwd
}

describe("startWatcher", () => {
	test("gives the lock back when setup throws", async () => {
		watchLog()
		const cwd = unstartable()

		await expect(startWatcher(cwd)).rejects.toThrow("wordpressUrl")
		expect(fs.existsSync(lockPath(cwd))).toBe(false)
	})

	test("gives the lock back when there is nothing to generate", async () => {
		watchLog()
		const cwd = workspace()

		await expect(startWatcher(cwd)).resolves.toBeUndefined()
		expect(fs.existsSync(lockPath(cwd))).toBe(false)
	})

	test("does not mistake a failed start of its own for another watcher", async () => {
		watchLog()
		const cwd = unstartable()

		await expect(startWatcher(cwd)).rejects.toThrow()
		await expect(startWatcher(cwd)).rejects.toThrow()

		expect(lines("info")).not.toContain(SKIPPED)
	})

	test("skips the watcher while a live process holds the lock", async () => {
		watchLog()
		const cwd = unstartable()
		const lock = lockPath(cwd)
		fs.mkdirSync(path.dirname(lock), { recursive: true })
		fs.writeFileSync(lock, String(process.pid))

		await expect(startWatcher(cwd)).resolves.toBeUndefined()
		expect(lines("info")).toContain(SKIPPED)
	})
})
