import { defineCommand } from "citty"
import { printBanner } from "../banner"
import { resolveConfig } from "../daemon/config"
import { generateOnce } from "../daemon/generate"
import { acquire, isLocked, lockPath, release } from "../daemon/lock"
import { log } from "../daemon/logger"
import { watch as runWatcher } from "../daemon/watch"
import { getVersion } from "../utils"

const args = {
	dir: {
		type: "string",
		description: "Override the Kizlo directory (defaults to kizlo.config.ts)",
	},
} as const

async function run({ args }: { args: { dir?: string } }): Promise<void> {
	const cwd = process.cwd()
	const lock = lockPath(cwd)

	// Single-instance: a framework dev script and a manual `kizlo watch` must
	// not both watch and write the same contract.
	if (isLocked(lock)) {
		log.info("Watcher already running — nothing to do.")
		return
	}

	printBanner(getVersion())

	const cfg = await resolveConfig(cwd, { dir: args.dir })

	acquire(lock)
	const cleanup = () => release(lock)
	process.on("exit", cleanup)
	for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
		process.on(signal, () => {
			cleanup()
			process.exit(0)
		})
	}

	// A broken server entry at startup shouldn't abort the watcher — report it and
	// keep watching so the next save can fix it.
	try {
		const ok = await generateOnce(cfg)
		if (ok) log.success("Contract generated")
		else log.warn(`No Kizlo server found in ${cfg.serverEntry}`)
	} catch (error) {
		log.error("Failed to generate the Kizlo contract:", error)
	}
	await runWatcher(cfg)
}

export const watch = defineCommand({
	meta: {
		name: "watch",
		description: "Watch your extensions and regenerate the Kizlo contract",
	},
	args,
	run,
})
