import { defineCommand } from "citty"
import { resolveTestConfig } from "../daemon/config"
import { log } from "../daemon/logger"
import { withSpinner } from "../utils"
import { composeDown, composeStop, composeUp } from "../wp/docker"
import { runSeeds } from "../wp/setup"
import { isSeeded } from "../wp/utils"

/** Boot the stack and seed it once (idempotent — skips seeding if already seeded). */
async function bringUp(cwd: string): Promise<void> {
	const cfg = await resolveTestConfig(cwd)
	process.env.WP_PORT = String(cfg.port)

	await withSpinner("Starting WordPress test stack", composeUp, "WordPress test stack ready")
	if (await isSeeded()) {
		log.info("Stack already seeded — skipping seed.")
		return
	}

	await withSpinner("Seeding WordPress", () => runSeeds({ port: cfg.port, fixtures: cfg.fixtures }), "WordPress seeded")
	log.success(`Stack ready on http://localhost:${cfg.port} — credentials at ${cfg.credentialsPath}`)
}

const up = defineCommand({
	meta: { name: "up", description: "Start the WordPress test stack and seed it if needed" },
	async run() {
		await bringUp(process.cwd())
	},
})

const reset = defineCommand({
	meta: { name: "reset", description: "Wipe the database and reseed a fresh WordPress test stack" },
	async run() {
		await withSpinner("Wiping WordPress database", () => composeDown({ volumes: true }), "Database wiped")
		await bringUp(process.cwd())
	},
})

const stop = defineCommand({
	meta: { name: "stop", description: "Stop the WordPress test stack, keeping the database volume" },
	async run() {
		await withSpinner("Stopping WordPress test stack", composeStop, "Stack stopped (volumes kept)")
	},
})

export const wp = defineCommand({
	meta: {
		name: "wp",
		description: "Manage the WordPress test stack (advanced: up | reset | stop)",
	},
	subCommands: { up, reset, stop },
})
