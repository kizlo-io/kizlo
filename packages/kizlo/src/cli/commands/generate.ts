import path from "node:path"
import { defineCommand } from "citty"
import type { WordPressCredentials } from "../../wordpress/types"
import { resolveConfig, resolveWordPressClientDir } from "../daemon/config"
import { generateOnce, generateWorkspaceClientOnce, PartialContractError, reportGenerationError } from "../daemon/generate"
import { log } from "../daemon/logger"
import { testWordPressCredentials } from "./_test-wordpress"

/**
 * Report and exit non-zero. A refused partial contract says one thing here that it cannot say
 * anywhere else, since its diagnostics are already on screen and the useful detail is what strict
 * mode did not do to the files on disk.
 */
function fail(message: string, error: unknown): never {
	if (error instanceof PartialContractError) log.error(`${error.message} The generated client on disk is unchanged.`)
	else reportGenerationError(message, error)
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
		test: {
			type: "boolean",
			description: "Generate against WordPress left running by kizlo test",
		},
	},
	async run({ args }) {
		const cwd = process.cwd()
		const strict = args.strict === true
		let credentials: WordPressCredentials | undefined
		if (args.test) {
			try {
				credentials = await testWordPressCredentials(cwd)
			} catch (error) {
				log.error(error instanceof Error ? error.message : String(error))
				process.exitCode = 1
				return
			}
		}
		const options = { credentials, strict }

		// A package or workspace that ships procedures has no server to build a contract from, but its
		// procedures still call the generated tree, so it needs the client on its own. Which WordPress
		// that describes is the usual `KIZLO_*` credential resolution, like every other command.
		const wordpressClientDir = await resolveWordPressClientDir(cwd)
		if (wordpressClientDir) {
			try {
				const result = await generateWorkspaceClientOnce(cwd, wordpressClientDir, options)
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
			ok = await generateOnce(cfg, options)
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
