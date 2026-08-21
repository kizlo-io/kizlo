import { EventEmitter } from "node:events"
import fs from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ownerAlive, type ProcessOwner } from "../process-owner"

const mocks = vi.hoisted(() => ({
	execFile: vi.fn(),
	home: "",
	spawn: vi.fn(),
}))

vi.mock("node:os", async (importOriginal) => ({
	...(await importOriginal<typeof import("node:os")>()),
	homedir: () => mocks.home,
}))

vi.mock("node:child_process", async (importOriginal) => {
	const original = await importOriginal<typeof import("node:child_process")>()
	Object.defineProperty(mocks.execFile, Symbol.for("nodejs.util.promisify.custom"), {
		value: async (file: string, args: string[]) => {
			mocks.execFile(file, args, () => {})
			return { stdout: "", stderr: "" }
		},
	})
	return { ...original, execFile: mocks.execFile, spawn: mocks.spawn }
})

import { reapOrphans, registerSession, spawnWatchdog } from "./session"

/** A finished `docker` invocation, delivered the way `spawn` delivers one. */
function exited(code: number, stdout = ""): unknown {
	const child = Object.assign(new EventEmitter(), {
		stdout: new EventEmitter(),
		stderr: new EventEmitter(),
		stdin: { end: () => {} },
	})
	setImmediate(() => {
		if (stdout) child.stdout.emit("data", stdout)
		child.emit("close", code)
	})
	return child
}

function registryPath(): string {
	return path.join(mocks.home, ".cache", "kizlo", "dev-sessions.json")
}

function readRegistry(): Record<string, ProcessOwner> {
	return JSON.parse(fs.readFileSync(registryPath(), "utf8")) as Record<string, ProcessOwner>
}

describe("dev session liveness", () => {
	beforeEach(() => {
		mocks.home = fs.mkdtempSync(path.join(process.cwd(), ".kizlo-session-"))
		mocks.execFile.mockClear()
		mocks.spawn.mockReset()
		// The container helpers reach docker through `spawn`; the watchdog test overrides this.
		mocks.spawn.mockImplementation(() => exited(0))
	})

	afterEach(() => {
		fs.rmSync(mocks.home, { recursive: true, force: true })
	})

	test("records a verifiable owner instead of a PID alone", async () => {
		const owner = await registerSession("site")

		expect(readRegistry().site).toEqual(owner)
		await expect(ownerAlive(owner)).resolves.toBe(true)
	})

	test("reaps a session when another process has reused its PID", async () => {
		await registerSession("site")
		const registry = readRegistry()
		const site = registry.site
		if (!site) throw new Error("Session was not registered")
		site.token = "a-different-process"
		fs.writeFileSync(registryPath(), JSON.stringify(registry))

		await expect(reapOrphans()).resolves.toEqual(["site"])
		expect(readRegistry()).toEqual({})
		expect(mocks.spawn).toHaveBeenCalledWith("docker", ["ps", "-q", "--filter", "label=com.docker.compose.project=site"], expect.anything())
	})

	test("passes the full owner identity to the detached watchdog", async () => {
		const owner = await registerSession("site")
		const unref = vi.fn()
		mocks.spawn.mockReturnValue({ pid: 4321, unref })

		expect(spawnWatchdog("site", owner)).toBe(4321)
		expect(mocks.spawn).toHaveBeenCalledWith(
			process.execPath,
			[expect.stringMatching(/watchdog\.js$/), String(owner.pid), String(owner.port), owner.token, "site"],
			{ detached: true, stdio: "ignore" },
		)
		expect(unref).toHaveBeenCalled()
	})
})
