import path from "node:path"
import { defineCommand } from "citty"
import { resolveConfig, resolveWordPressClientDir } from "../daemon/config"
import { generateOnce, generateWorkspaceClientOnce, PartialContractError } from "../daemon/generate"
import { log } from "../daemon/logger"

/**
 * Report and exit non-zero. A refused partial contract is the one failure here that is a decision
 * rather than a fault, and its diagnostics are already on screen, so it prints its own line and no
 * stack: the useful detail is what strict mode did not do to the files on disk.
 */
function fail(message: string, error: unknown): never {
	if (error instanceof PartialContractError) log.error(`${error.message} The generated client on disk is unchanged.`)
	else log.error(message, error)
	process.exit(1)
}

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
		strict: {
			type: "boolean",
			description: "Fail instead of generating a client WordPress had to exclude routes or types from",
		},
	},
	async run({ args }) {
		const cwd = process.cwd()
		const strict = args.strict === true

		// A package or workspace that ships procedures has no server to build a contract from, but its
		// procedures still call the generated tree, so it needs the client on its own. Which WordPress
		// that describes is the usual `KIZLO_*` credential resolution, like every other command.
		const wordpressClientDir = await resolveWordPressClientDir(cwd)
		if (wordpressClientDir) {
			try {
				const result = await generateWorkspaceClientOnce(cwd, wordpressClientDir, { strict })
				const file = path.resolve(cwd, wordpressClientDir, "wordpress.ts")
				log.success(`WordPress client ${result === "generated" ? "written to" : "already current at"} ${file}`)
			} catch (error) {
				fail("Failed to generate the WordPress client:", error)
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
			ok = await generateOnce(cfg, { strict })
		} catch (error) {
			fail("Failed to generate the Kizlo contract:", error)
		}
		if (!ok) {
			log.error(`No Kizlo server found in ${cfg.serverEntry}`)
			process.exit(1)
		}
		log.success("Contract generated")
	},
})
