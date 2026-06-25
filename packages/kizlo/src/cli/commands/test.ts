import { spawn } from "node:child_process"
import { type ArgsDef, type CommandContext, defineCommand } from "citty"
import { type ResolvedTestConfig, resolveTestConfig } from "../daemon/config"
import { log } from "../daemon/logger"
import { groupDefault, type PackageManager, withSpinner } from "../utils"
import { createStack, type DockerStack } from "../wp/docker"
import { runSeeds } from "../wp/setup"
import { testStack } from "../wp/stack"
import { isSeeded } from "../wp/utils"

async function resolve(cwd: string): Promise<{ cfg: ResolvedTestConfig; stack: DockerStack }> {
	const cfg = await resolveTestConfig(cwd)
	return { cfg, stack: createStack(testStack(cfg)) }
}

/** Boot the stack and seed it once (idempotent — skips seeding if already seeded). */
async function bringUp(cfg: ResolvedTestConfig, stack: DockerStack): Promise<void> {
	await withSpinner("Starting WordPress test stack", () => stack.composeUp(), "WordPress test stack ready")
	if (await isSeeded()) {
		log.info("Stack already seeded — skipping seed.")
		return
	}

	await withSpinner("Seeding WordPress", () => runSeeds({ port: cfg.port, fixtures: cfg.fixtures }), "WordPress seeded")
	log.success(`Stack ready on http://localhost:${cfg.port} — credentials at ${cfg.credentialsPath}`)
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
	const { cfg, stack } = await resolve(process.cwd())

	if (args.reset) await withSpinner("Wiping WordPress database", () => stack.composeDown({ volumes: true }), "Database wiped")

	await withSpinner("Starting WordPress test stack", () => stack.composeUp(), "WordPress test stack ready")
	if (!(await isSeeded())) {
		await withSpinner("Seeding WordPress", () => runSeeds({ port: cfg.port, fixtures: cfg.fixtures }), "WordPress seeded")
	}

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
		await bringUp(cfg, stack)
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
