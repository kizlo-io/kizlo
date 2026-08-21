import { EventEmitter } from "node:events"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }))

vi.mock("node:child_process", async (importOriginal) => ({
	...(await importOriginal<typeof import("node:child_process")>()),
	spawn: mocks.spawn,
}))

import { stackStatus, stopProjectContainers } from "./docker"

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

/**
 * Answer each `docker` invocation by its subcommand: the container query `stackStatus` asks first,
 * then the two probes `dockerStatus` falls back to when that query could not run.
 */
function docker(answers: { ps: unknown; client?: number; daemon?: number }): void {
	mocks.spawn.mockImplementation((_cmd: string, args: string[]) => {
		if (args[0] === "ps") return answers.ps
		if (args[0] === "--version") return exited(answers.client ?? 0)
		return exited(answers.daemon ?? 0)
	})
}

describe("compose project containers", () => {
	beforeEach(() => {
		mocks.spawn.mockReset()
	})

	test("is running while any of the project's containers is up", async () => {
		docker({ ps: exited(0, "abc123\ndef456\n") })
		await expect(stackStatus("kizlo-site-dev")).resolves.toBe("running")
	})

	test("is stopped when the project has no containers left", async () => {
		docker({ ps: exited(0, "") })
		await expect(stackStatus("kizlo-site-dev")).resolves.toBe("stopped")
	})

	test("is stopped when the daemon that would run them is gone", async () => {
		docker({ ps: exited(1), daemon: 1 })
		await expect(stackStatus("kizlo-site-dev")).resolves.toBe("stopped")
	})

	test("is unknown when the query failed but the daemon is fine", async () => {
		docker({ ps: exited(1) })
		await expect(stackStatus("kizlo-site-dev")).resolves.toBe("unknown")
	})

	test("stops every running container the project has", async () => {
		docker({ ps: exited(0, "abc123\ndef456\n") })
		await stopProjectContainers("kizlo-site-dev")
		expect(mocks.spawn).toHaveBeenCalledWith("docker", ["stop", "abc123", "def456"], expect.anything())
	})

	test("runs no stop when the project has nothing left running", async () => {
		docker({ ps: exited(0, "") })
		await stopProjectContainers("kizlo-site-dev")
		expect(mocks.spawn).toHaveBeenCalledTimes(1)
	})

	test("names the project by its compose label", async () => {
		docker({ ps: exited(0, "abc123\n") })
		await stackStatus("kizlo-site-dev")
		expect(mocks.spawn).toHaveBeenCalledWith(
			"docker",
			["ps", "-q", "--filter", "label=com.docker.compose.project=kizlo-site-dev"],
			expect.anything(),
		)
	})
})
