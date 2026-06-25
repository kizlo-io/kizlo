import { rmSync } from "node:fs"
import { defineCommand } from "citty"
import { type ResolvedDevConfig, resolveDevConfig } from "../daemon/config"
import { log } from "../daemon/logger"
import { ensureGitignored, groupDefault, withSpinner } from "../utils"
import { bootstrapDev, type DevStackInfo } from "../wp/dev"
import { createStack, type DockerStack } from "../wp/docker"
import { devStack } from "../wp/stack"

async function resolve(cwd: string): Promise<{ cfg: ResolvedDevConfig; stack: DockerStack }> {
	const cfg = await resolveDevConfig(cwd)
	return { cfg, stack: createStack(devStack(cfg)) }
}

/** Print the connection summary. On a fresh install, show the one-time wp-admin password. */
function printSummary(info: DevStackInfo): void {
	log.success(`WordPress dev stack ready at ${info.url}`)
	if (info.secrets) {
		log.info(`wp-admin: ${info.url}/wp-admin  (user: ${info.username} / pass: ${info.secrets.password})`)
		log.info("Save the password now — it's shown only once and isn't stored on disk.")
	} else if (info.imported) {
		log.info(`wp-admin: ${info.url}/wp-admin — log in with your imported site's own credentials`)
	} else {
		log.info(`wp-admin: ${info.url}/wp-admin  (user: ${info.username}) — password unchanged from first install`)
	}

	log.info(`database: 127.0.0.1:${info.dbPort}  (db: wordpress, user: wordpress, pass: wppass)`)
	if (info.seeded > 0) log.info(`seeded:   ${info.seeded} fixture${info.seeded === 1 ? "" : "s"}`)
}

/** Start (or resume) the dev stack and print the connection summary. Backs bare `kizlo dev`. */
async function bringUp(): Promise<void> {
	const { cfg } = await resolve(process.cwd())
	// The install folder holds thousands of files; keep it out of git, but it stays
	// visibly named at the path the user chose so they know it's their dev site.
	if (!cfg.wordpressPath.startsWith("..")) ensureGitignored(cfg.configDir, cfg.wordpressPath)

	const creds = await withSpinner("Starting WordPress dev stack", () => bootstrapDev(cfg), "WordPress dev stack ready")
	printSummary(creds)
}

const stop = defineCommand({
	meta: { name: "stop", description: "Stop the dev stack, keeping the database volume" },
	async run() {
		const { stack } = await resolve(process.cwd())
		await withSpinner("Stopping WordPress dev stack", () => stack.composeStop(), "Stack stopped (volumes kept)")
	},
})

const down = defineCommand({
	// No `-v`: the dev DB is the only volume, so dropping it alone leaves the host files
	// without a database — an inconsistent half-install. `reset` is the destructive path
	// (it wipes files and DB together); `down` only removes the containers.
	meta: { name: "down", description: "Stop and remove the dev stack containers (keeps the database and files)" },
	async run() {
		const { stack } = await resolve(process.cwd())
		await withSpinner("Removing WordPress dev stack", () => stack.composeDown(), "Stack removed (database and files kept)")
	},
})

const reset = defineCommand({
	meta: { name: "reset", description: "Wipe the database and the install folder, then rebuild fresh" },
	async run() {
		const { cfg, stack } = await resolve(process.cwd())
		await withSpinner("Wiping WordPress dev stack", () => stack.composeDown({ volumes: true }), "Stack wiped")
		// The install lives on the host, not in a volume, so clear it by hand for a
		// genuinely fresh rebuild (the WordPress image repopulates core on next up).
		rmSync(cfg.wordpressDir, { recursive: true, force: true })
		const creds = await withSpinner("Starting WordPress dev stack", () => bootstrapDev(cfg), "WordPress dev stack ready")
		printSummary(creds)
	},
})

const subCommands = { stop, down, reset }

export const dev = defineCommand({
	meta: { name: "dev", description: "Manage the local WordPress dev stack (stop | down | reset)" },
	subCommands,
	// Bare `kizlo dev` starts the stack; the subcommands manage its lifecycle.
	run: groupDefault(Object.keys(subCommands), bringUp),
})
