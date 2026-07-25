import { spawn } from "node:child_process"
import { type ArgsDef, type CommandContext, defineCommand } from "citty"
import { type ResolvedTestConfig, resolveTestConfig } from "../daemon/config"
import { log } from "../daemon/logger"
import { groupDefault, type PackageManager, pickStackPort, withSpinner } from "../utils"
import { createStack, type DockerStack, dockerHint, dockerStatus } from "../wp/docker"
import { runPluginPhpunit } from "../wp/phpunit"
import { isFree } from "../wp/ports"
import { runSeeds } from "../wp/setup"
import { testStack } from "../wp/stack"
import { isSeeded, recordedPort } from "../wp/utils"

async function resolve(cwd: string): Promise<{ cfg: ResolvedTestConfig; stack: DockerStack }> {
	const cfg = await resolveTestConfig(cwd)
	return { cfg, stack: createStack(testStack(cfg)) }
}

/**
 * The host port to bring the test WordPress up on. Unlike local dev WordPress (rebuilt every run), the
 * test WordPress is reused and its tests connect via the URL recorded in the credentials artifact —
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
				`The test WordPress port ${recorded} (from a previous run) is now held by something else.\n` +
					"Free that port, or run `kizlo test reset` to rebuild on a fresh one.",
			)
			process.exit(1)
		}
	}
	return pickStackPort(cfg.port, { fixed: cfg.portExplicit, configKey: "test.port" })
}

/**
 * Boot the test WordPress on a resolved host port and seed it once (idempotent — skips seeding when
 * already seeded). Returns the port-bound stack and the port, so callers report the real URL.
 */
async function bringUp(cfg: ResolvedTestConfig, stack: DockerStack, fresh = false): Promise<{ stack: DockerStack; port: number }> {
	const port = await resolveTestPort(cfg, stack, fresh)
	const bound = port === cfg.port ? stack : createStack(testStack({ ...cfg, port }))

	await withSpinner("Starting test WordPress", () => bound.composeUp(), "Test WordPress ready")
	if (await isSeeded()) log.info("Test WordPress already seeded — skipping seed.")
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

/** Log which test command is about to run, then spawn it and resolve with its exit code. */
function runProjectTests(cfg: ResolvedTestConfig): Promise<number> {
	log.info(cfg.command ? `Running: ${cfg.command}` : `Running: ${testCommand(cfg.packageManager).join(" ")}`)
	return spawnTest(cfg.command, cfg.packageManager)
}

const runArgs = {
	teardown: { type: "boolean", description: "Tear down the test WordPress after tests finish (default: leave it running for fast reruns)" },
	reset: { type: "boolean", description: "Wipe the database and reseed before running" },
} satisfies ArgsDef

/**
 * Run the project's tests. When `test.local` is set, boot (+ seed) local WordPress first, run the
 * suite (JS then the plugin's PHPUnit) against it, then leave it up (or tear down). Without
 * `test.local`, there's no Docker WordPress to manage — just run the project's own test script.
 */
async function runSuite({ args }: CommandContext<typeof runArgs>): Promise<void> {
	const cfg = await resolveTestConfig(process.cwd())

	if (!cfg.local) {
		process.exit(await runProjectTests(cfg))
	}

	const status = await dockerStatus()
	if (status !== "running") {
		log.error(dockerHint(status))
		process.exit(1)
	}

	const probe = createStack(testStack(cfg))
	if (args.reset) await withSpinner("Wiping WordPress database", () => probe.composeDown({ volumes: true }), "Database wiped")

	const { stack } = await bringUp(cfg, probe, Boolean(args.reset))

	let code = 1
	try {
		const jsCode = await runProjectTests(cfg)
		const phpCode = await runPluginPhpunit(cfg)
		code = jsCode !== 0 ? jsCode : phpCode
	} finally {
		if (args.teardown) await withSpinner("Tearing down test WordPress", () => stack.composeDown(), "Test WordPress stopped")
		else log.info("Test WordPress left running for fast reruns — `kizlo test stop` to stop it, or rerun with --teardown.")
	}

	process.exit(code)
}

const stop = defineCommand({
	meta: { name: "stop", description: "Stop the test WordPress, keeping the database volume" },
	async run() {
		const { stack } = await resolve(process.cwd())
		await withSpinner("Stopping test WordPress", () => stack.composeStop(), "Test WordPress stopped (volumes kept)")
	},
})

const reset = defineCommand({
	meta: { name: "reset", description: "Wipe the database and reseed fresh test WordPress" },
	async run() {
		const { cfg, stack } = await resolve(process.cwd())
		await withSpinner("Wiping WordPress database", () => stack.composeDown({ volumes: true }), "Database wiped")
		const { port } = await bringUp(cfg, stack, true)
		log.success(`Test WordPress ready on http://localhost:${port} — credentials at ${cfg.credentialsPath}`)
	},
})

const subCommands = { stop, reset }

export const test = defineCommand({
	meta: {
		name: "test",
		description: "Run tests against local WordPress (stop | reset)",
	},
	args: runArgs,
	subCommands,
	run: groupDefault(Object.keys(subCommands), runSuite),
})
