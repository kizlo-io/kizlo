import { EventEmitter } from "node:events"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }))

vi.mock("node:child_process", async (importOriginal) => ({
	...(await importOriginal<typeof import("node:child_process")>()),
	spawn: mocks.spawn,
}))

import { composeUp, createStack, stackStatus, stopProjectContainers } from "./docker"

/** A finished `docker` invocation, delivered the way `spawn` delivers one. */
function exited(code: number, stdout = "", stderr = ""): unknown {
	const child = Object.assign(new EventEmitter(), {
		stdout: new EventEmitter(),
		stderr: new EventEmitter(),
		stdin: { end: () => {} },
	})
	setImmediate(() => {
		if (stdout) child.stdout.emit("data", stdout)
		if (stderr) child.stderr.emit("data", stderr)
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

/**
 * Answer the calls `composeUp` makes on a failed boot: the `up` itself, the per-service `compose ps`
 * it asks next, and one `docker inspect` per failing container, keyed by container name.
 */
function boot(answers: { up: unknown; ps?: unknown; health?: Record<string, unknown> }): void {
	mocks.spawn.mockImplementation((_cmd: string, args: string[]) => {
		if (args[0] === "inspect") return answers.health?.[args[3] ?? ""] ?? exited(0, "null")
		if (args.includes("up")) return answers.up
		if (args.includes("ps")) return answers.ps ?? exited(0, "")
		return exited(0)
	})
}

const STACK = { project: "kizlo-site-dev", port: 8080, wordpressTag: "latest", composeFiles: ["/tmp/docker-compose.yml"] }

/** `compose ps --format json` output: one object per line, as compose v2 prints it. */
function psLines(...containers: { Name: string; Service: string; State: string; Health?: string }[]): string {
	return `${containers.map((container) => JSON.stringify(container)).join("\n")}\n`
}

/** A container health blob with a single recorded probe result. */
function health(exitCode: number, output: string): unknown {
	return exited(0, JSON.stringify({ Status: "unhealthy", FailingStreak: 60, Log: [{ ExitCode: exitCode, Output: output }] }))
}

describe("composeUp", () => {
	beforeEach(() => {
		mocks.spawn.mockReset()
		createStack(STACK)
	})

	test("bounds the wait so a stack that never converges can't hang the command", async () => {
		boot({ up: exited(0) })
		await composeUp()
		const args = mocks.spawn.mock.calls[0]?.[1] as string[]
		expect(args).toContain("--wait-timeout")
		expect(Number(args[args.indexOf("--wait-timeout") + 1])).toBeGreaterThan(0)
	})

	test("reports the failing service, its state and what its healthcheck said", async () => {
		boot({
			up: exited(1, "container is unhealthy"),
			ps: exited(
				0,
				psLines(
					{ Name: "dev-wordpress-1", Service: "wordpress", State: "running", Health: "unhealthy" },
					{ Name: "dev-wp-cli-1", Service: "wp-cli", State: "created", Health: "" },
					{ Name: "dev-mysql-1", Service: "mysql", State: "running", Health: "healthy" },
				),
			),
			health: { "dev-wordpress-1": health(22, "curl: (22) The requested URL returned error: 404") },
		})

		await expect(composeUp()).rejects.toThrow(/wordpress: running \(unhealthy\).*curl: \(22\).*404/s)
	})

	test("reports a service stuck behind an unhealthy dependency", async () => {
		boot({
			up: exited(1),
			ps: exited(0, psLines({ Name: "dev-wp-cli-1", Service: "wp-cli", State: "created", Health: "" })),
		})
		const error = await composeUp().catch((cause: Error) => cause)
		expect(error).toMatchObject({ message: expect.stringContaining("wp-cli: created") })
	})

	test("keeps docker's own output when no service looks wrong", async () => {
		boot({
			up: exited(1, "", "no such service: wordpress"),
			ps: exited(0, psLines({ Name: "dev-mysql-1", Service: "mysql", State: "running", Health: "healthy" })),
		})
		await expect(composeUp()).rejects.toThrow(/no such service: wordpress/)
	})

	test("keeps docker's own message even when a service also looks wrong", async () => {
		// A denied mount or an already-bound port is only ever explained by docker itself, and it
		// still leaves a service behind in `created`, so the service list must not stand in for it.
		boot({
			up: exited(1, "", "Error response from daemon: Mounts denied: /Volumes/ext is not shared from the host"),
			ps: exited(
				0,
				psLines(
					{ Name: "dev-mysql-1", Service: "mysql", State: "running", Health: "healthy" },
					{ Name: "dev-wordpress-1", Service: "wordpress", State: "created", Health: "" },
				),
			),
		})
		const error = await composeUp().catch((cause: Error) => cause)
		expect(error).toMatchObject({ message: expect.stringContaining("Mounts denied") })
		expect(error).toMatchObject({ message: expect.stringContaining("wordpress: created") })
	})

	test("drops compose's progress chatter but keeps the lines that say what went wrong", async () => {
		const stderr = [
			" Container dev-mysql-1  Creating",
			" Container dev-mysql-1  Created",
			" Container dev-mysql-1  Waiting",
			" Container dev-mysql-1  Healthy",
			" Network dev_default  Created",
			" Container dev-wordpress-1  Error dependency wordpress failed to start",
			"dependency failed to start: container dev-wordpress-1 is unhealthy",
		].join("\n")
		boot({
			up: exited(1, "", stderr),
			ps: exited(0, psLines({ Name: "dev-wordpress-1", Service: "wordpress", State: "running", Health: "unhealthy" })),
			health: { "dev-wordpress-1": health(1, "") },
		})

		const failure = await composeUp().catch((cause: Error) => cause)
		expect(failure).toMatchObject({ message: expect.stringContaining("Error dependency wordpress failed to start") })
		expect(failure).toMatchObject({ message: expect.stringContaining("is unhealthy") })
		expect(failure).toMatchObject({ message: expect.stringContaining("wordpress: running (unhealthy), healthcheck exit 1") })
		expect(failure).toMatchObject({ message: expect.not.stringMatching(/Container \S+\s+Created$/m) })
		expect(failure).toMatchObject({ message: expect.not.stringMatching(/\bHealthy$/m) })
	})

	test("leaves a running service alone when compose reports no health field for it", async () => {
		boot({
			up: exited(1, "", "dependency failed to start"),
			ps: exited(
				0,
				psLines(
					{ Name: "dev-wp-cli-1", Service: "wp-cli", State: "running" },
					{ Name: "dev-wordpress-1", Service: "wordpress", State: "created" },
				),
			),
		})
		const failure = await composeUp().catch((cause: Error) => cause)
		expect(failure).toMatchObject({ message: expect.stringContaining("wordpress: created") })
		expect(failure).toMatchObject({ message: expect.not.stringContaining("wp-cli") })
	})

	test("still reports docker's error when the diagnosis itself faults", async () => {
		// A health log without `Output`, and a `ps` that cannot be parsed: neither may turn the
		// failure being reported into a crash inside the code that exists to explain it.
		boot({
			up: exited(1, "", "container is unhealthy"),
			ps: exited(0, '{"Name":"dev-wordpress-1","Service":"wordpress","State":"running","Health":"unhealthy"}'),
			health: { "dev-wordpress-1": exited(0, JSON.stringify({ Status: "unhealthy", Log: [{ ExitCode: 1 }] })) },
		})
		const failure = await composeUp().catch((cause: Error) => cause)
		expect(failure).toMatchObject({ message: expect.stringContaining("container is unhealthy") })
		expect(failure).toMatchObject({ message: expect.stringContaining("wordpress: running (unhealthy)") })
	})
})
