import { spawn } from "node:child_process"
import { defineCommand } from "citty"
import { resolveTestConfig } from "../daemon/config"
import { log } from "../daemon/logger"
import { type PackageManager, withSpinner } from "../utils"
import { composeDown, composeUp } from "../wp/docker"
import { runSeeds } from "../wp/setup"
import { isSeeded } from "../wp/utils"

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
	return new Promise<number>((resolve, reject) => {
		child.on("error", reject)
		child.on("close", (code) => resolve(code ?? 0))
	})
}

export const test = defineCommand({
	meta: {
		name: "test",
		description: "Boot the WordPress test stack (if needed), seed it, and run your tests against it",
	},
	args: {
		teardown: { type: "boolean", description: "Tear down the test stack after tests finish (default: leave it running for fast reruns)" },
		reset: { type: "boolean", description: "Wipe the database and reseed before running" },
	},
	async run({ args }) {
		const cfg = await resolveTestConfig(process.cwd())
		process.env.WP_PORT = String(cfg.port)

		if (args.reset) await withSpinner("Wiping WordPress database", () => composeDown({ volumes: true }), "Database wiped")

		await withSpinner("Starting WordPress test stack", composeUp, "WordPress test stack ready")
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
			if (args.teardown) await withSpinner("Tearing down WordPress test stack", () => composeDown(), "WordPress test stack stopped")
			else log.info("Stack left running for fast reruns — `kizlo wp stop` to stop it, or rerun with --teardown.")
		}

		process.exit(code)
	},
})
