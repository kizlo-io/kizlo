import { defineCommand } from "citty"
import { printBanner } from "../banner"
import { resolveConfig } from "../daemon/config"
import { generateOnce } from "../daemon/generate"
import { acquire, isLocked, lockPath, release } from "../daemon/lock"
import { log } from "../daemon/logger"
import { watch } from "../daemon/watch"
import { getVersion } from "../utils"

export const dev = defineCommand({
	meta: {
		name: "dev",
		description: "Watch your extensions and regenerate the Kizlo contract",
	},
	args: {
		dir: {
			type: "string",
			description: "Override the Kizlo directory (defaults to kizlo.config.ts)",
		},
	},
	async run({ args }) {
		const cwd = process.cwd()
		const lock = lockPath(cwd)

		// Single-instance: a framework dev script and a manual `kizlo dev` must
		// not both watch and write the same contract.
		if (isLocked(lock)) {
			log.info("Dev daemon already running — nothing to do.")
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

		await generateOnce(cfg)
		await watch(cfg)
	},
})
