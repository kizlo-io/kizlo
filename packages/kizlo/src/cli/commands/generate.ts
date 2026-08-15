import path from "node:path"
import { defineCommand } from "citty"
import { resolveConfig, resolveWordPressClientDir } from "../daemon/config"
import { generateOnce, generateWorkspaceClientOnce } from "../daemon/generate"
import { log } from "../daemon/logger"

export const generate = defineCommand({
	meta: {
		name: "generate",
		description: "Generate the Kizlo contract once (for builds and CI)",
	},
	args: {
		dir: {
			type: "string",
			description: "Override the Kizlo directory (defaults to kizlo.config.ts)",
		},
	},
	async run({ args }) {
		const cwd = process.cwd()

		// A package or workspace that ships procedures has no server to build a contract from, but its
		// procedures still call the generated tree, so it needs the client on its own. Which WordPress
		// that describes is the usual `KIZLO_*` credential resolution, like every other command.
		const wordpressClientDir = await resolveWordPressClientDir(cwd)
		if (wordpressClientDir) {
			try {
				const result = await generateWorkspaceClientOnce(cwd, wordpressClientDir)
				const file = path.resolve(cwd, wordpressClientDir, "wordpress.ts")
				log.success(`WordPress client ${result === "generated" ? "written to" : "already current at"} ${file}`)
			} catch (error) {
				log.error("Failed to generate the WordPress client:", error)
				process.exit(1)
			}
		}

		const cfg = await resolveConfig(cwd, { dir: args.dir })
		if (!cfg) {
			// Only worth saying when nothing at all was generated.
			if (!wordpressClientDir) {
				log.info("No Kizlo server directory configured, nothing to generate. Set `dir` in kizlo.config.ts or pass --dir.")
			}
			return
		}
		let ok: boolean
		try {
			ok = await generateOnce(cfg)
		} catch (error) {
			log.error("Failed to generate the Kizlo contract:", error)
			process.exit(1)
		}
		if (!ok) {
			log.error(`No Kizlo server found in ${cfg.serverEntry}`)
			process.exit(1)
		}
		log.success("Contract generated")
	},
})
