import { spawn } from "node:child_process"
import { type ArgsDef, type CommandContext, defineCommand } from "citty"
import { type ResolvedTestConfig, resolveTestConfig } from "../daemon/config"
import { log } from "../daemon/logger"
import { groupDefault, type PackageManager, pickStackPort, withSpinner } from "../utils"
import { createStack, type DockerStack } from "../wp/docker"
import { isFree } from "../wp/ports"
import { runSeeds } from "../wp/setup"
import { testStack } from "../wp/stack"
import { isSeeded, recordedPort } from "../wp/utils"

async function resolve(cwd: string): Promise<{ cfg: ResolvedTestConfig; stack: DockerStack }> {
	const cfg = await resolveTestConfig(cwd)
	return { cfg, stack: createStack(testStack(cfg)) }
}

/**
 * The host port to bring the test stack up on. Unlike the dev stack (rebuilt every run), the
 * test stack is reused and its tests connect via the URL recorded in the credentials artifact —
 * so the port can't just be re-chosen each time:
 *
 * - A **running** stack keeps its live published port (fast reruns stay on the same URL).
 * - A **warm but stopped** stack reuses the port recorded in the credentials — that URL is what
 *   tests read, so it must not move; if something else stole it meanwhile we stop and say so,
 *   rather than silently relocate.
 * - Only a **cold** stack (never seeded, or wiped by `reset` / `--reset`) picks a fresh free port
 *   from the configured default — auto-stepping past a collision (e.g. another project's stack)
 *   unless `test.port` was set explicitly, in which case the user owns the clash.
 *
 * `fresh` forces the cold path so a `reset` re-picks — that's how a poisoned recorded port heals.
 */
async function resolveTestPort(cfg: ResolvedTestConfig, stack: DockerStack, fresh: boolean): Promise<number> {
	if (!fresh) {
		const live = await stack.publishedPort()
		if (live !== undefined) return live

		const recorded = recordedPort()
		if (recorded !== undefined) {
			if (await isFree(recorded)) return recorded
			log.error(
				`The test stack's port ${recorded} (from a previous run) is now held by something else.\n` +
					"Free that port, or run `kizlo test reset` to rebuild on a fresh one.",
			)
			process.exit(1)
		}
	}
	return pickStackPort(cfg.port, { fixed: cfg.portExplicit, configKey: "test.port" })
}

/**
 * Boot the test stack on a resolved host port and seed it once (idempotent — skips seeding when
 * already seeded). Returns the port-bound stack and the port, so callers report the real URL.
 */
async function bringUp(cfg: ResolvedTestConfig, stack: DockerStack, fresh = false): Promise<{ stack: DockerStack; port: number }> {
	const port = await resolveTestPort(cfg, stack, fresh)
	// Rebind the stack to the resolved port (publishes WP_PORT there); reuse the existing
	// binding when the port didn't move, so the common fast-rerun path allocates nothing.
	const bound = port === cfg.port ? stack : createStack(testStack({ ...cfg, port }))

	await withSpinner("Starting WordPress test stack", () => bound.composeUp(), "WordPress test stack ready")
	if (await isSeeded()) log.info("Stack already seeded — skipping seed.")
	else await withSpinner("Seeding WordPress", () => runSeeds({ port, fixtures: cfg.fixtures }), "WordPress seeded")

	return { stack: bound, port }
}

/** `<pm> test` runs the project's own test script (bun needs `run` to skip its built-in runner). */
function testCommand(pm: PackageManager): string[] {
	return pm === "bun" ? ["bun", "run", "test"] : [pm, "test"]
}

/** Spawn the test command, inheriting stdio, and resolve with its exit code. */
function spawnTest(command: string | undefined, pm: PackageManager): Promise<number> {
	const argv = command ? [command] : testCommand(pm)
	const child = spawn(argv[0] as string, argv.slice(1), {
		stdio: "inherit",
		shell: command !== undefined || process.platform === "win32",
	})
	return new Promise<number>((resolvePromise, reject) => {
		child.on("error", reject)
		child.on("close", (code) => resolvePromise(code ?? 0))
	})
}

const runArgs = {
	teardown: { type: "boolean", description: "Tear down the test stack after tests finish (default: leave it running for fast reruns)" },
	reset: { type: "boolean", description: "Wipe the database and reseed before running" },
} satisfies ArgsDef

/** Boot (+ seed) the stack, run the project's test script, then leave it up (or tear down). */
async function runSuite({ args }: CommandContext<typeof runArgs>): Promise<void> {
	const { cfg, stack: probe } = await resolve(process.cwd())

	if (args.reset) await withSpinner("Wiping WordPress database", () => probe.composeDown({ volumes: true }), "Database wiped")

	const { stack } = await bringUp(cfg, probe, Boolean(args.reset))

	log.info(cfg.command ? `Running: ${cfg.command}` : `Running: ${testCommand(cfg.packageManager).join(" ")}`)
	let code = 1
	try {
		code = await spawnTest(cfg.command, cfg.packageManager)
	} finally {
		// Keep the stack up by default so reruns skip the slow container boot;
		// `isSeeded` keeps the next run idempotent. Opt into a clean teardown.
		if (args.teardown) await withSpinner("Tearing down WordPress test stack", () => stack.composeDown(), "WordPress test stack stopped")
		else log.info("Stack left running for fast reruns — `kizlo test stop` to stop it, or rerun with --teardown.")
	}

	process.exit(code)
}

const stop = defineCommand({
	meta: { name: "stop", description: "Stop the WordPress test stack, keeping the database volume" },
	async run() {
		const { stack } = await resolve(process.cwd())
		await withSpinner("Stopping WordPress test stack", () => stack.composeStop(), "Stack stopped (volumes kept)")
	},
})

const down = defineCommand({
	meta: { name: "down", description: "Stop and remove the test stack containers" },
	args: { volumes: { type: "boolean", alias: "v", description: "Also drop the database volume" } },
	async run({ args }) {
		const { stack } = await resolve(process.cwd())
		const done = args.volumes ? "Stack removed (volumes dropped)" : "Stack removed (volumes kept)"
		await withSpinner("Removing WordPress test stack", () => stack.composeDown({ volumes: args.volumes }), done)
	},
})

const reset = defineCommand({
	meta: { name: "reset", description: "Wipe the database and reseed a fresh WordPress test stack" },
	async run() {
		const { cfg, stack } = await resolve(process.cwd())
		await withSpinner("Wiping WordPress database", () => stack.composeDown({ volumes: true }), "Database wiped")
		const { port } = await bringUp(cfg, stack, true)
		log.success(`Stack ready on http://localhost:${port} — credentials at ${cfg.credentialsPath}`)
	},
})

const subCommands = { stop, down, reset }

export const test = defineCommand({
	meta: {
		name: "test",
		description: "Manage the WordPress test stack and run tests (stop | down | reset)",
	},
	args: runArgs,
	subCommands,
	// Bare `kizlo test` runs the suite; the lifecycle subcommands only manage the stack.
	run: groupDefault(Object.keys(subCommands), runSuite),
})
