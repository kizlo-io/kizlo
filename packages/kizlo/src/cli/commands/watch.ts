import { defineCommand } from "citty"
import { printBanner } from "../banner"
import { startWatcher } from "../daemon/watch"
import { getVersion } from "../utils"

const args = {
	dir: {
		type: "string",
		description: "Override the Kizlo directory (defaults to kizlo.config.ts)",
	},
} as const

async function run({ args }: { args: { dir?: string } }): Promise<void> {
	printBanner(getVersion())

	const stop = await startWatcher(process.cwd(), { dir: args.dir })
	// Another watcher already owns the lock — nothing to run in the foreground.
	if (!stop) return

	process.on("exit", stop)
	for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
		process.on(signal, () => {
			stop()
			process.exit(0)
		})
	}
	// chokidar's persistent watcher holds the event loop open, so the process stays
	// alive here until a signal tears it down.
}

export const watch = defineCommand({
	meta: {
		name: "watch",
		description: "Watch your extensions and regenerate the Kizlo contract",
	},
	args,
	run,
})
