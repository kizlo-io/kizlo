import path from "node:path"
import { defineCommand } from "citty"
import { resolveConfig, resolveWatchCredentials } from "../daemon/config"
import { type GenerateWordPressOptions, generateOnce, PartialContractError, reportGenerationError } from "../daemon/generate"
import { log } from "../daemon/logger"
import { testWordPressCredentials } from "./_test-wordpress"

/**
 * Report and exit non-zero. A refused partial contract says one thing here that it cannot say
 * anywhere else, since its diagnostics are already on screen and the useful detail is what strict
 * mode did not do to the files on disk.
 */
function fail(message: string, error: unknown): never {
	if (error instanceof PartialContractError) log.error(`${error.message} The generated introspection on disk is unchanged.`)
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
			description: "Fail instead of generating an introspection WordPress had to exclude routes or types from",
		},
		test: {
			type: "boolean",
			description: "Generate against WordPress left running by kizlo test",
		},
	},
	async run({ args }) {
		const cwd = process.cwd()
		const strict = args.strict === true
		let options: GenerateWordPressOptions
		if (args.test) {
			try {
				options = { credentials: await testWordPressCredentials(cwd), strict }
			} catch (error) {
				log.error(error instanceof Error ? error.message : String(error))
				process.exitCode = 1
				return
			}
		} else {
			// Without a reachable WordPress — no enabled local stack, or incomplete connection envs — build
			// the contract with introspection skipped rather than failing to fetch from a WordPress that
			// is not there. `--test` always has the seeded stack to fetch from.
			const credentials = await resolveWatchCredentials(cwd)
			if (credentials) options = { credentials, strict }
			else {
				log.info("No WordPress connection configured; generating the contract only, introspection skipped.")
				options = { skipIntrospection: true, strict }
			}
		}

		const cfg = await resolveConfig(cwd, { dir: args.dir })
		if (!cfg) {
			log.info("Nothing to generate. Set `dir` in kizlo.config.ts or pass --dir.")
			return
		}

		let result: Awaited<ReturnType<typeof generateOnce>>
		try {
			result = await generateOnce(cfg, options)
		} catch (error) {
			fail("Failed to generate the Kizlo contract:", error)
		}

		if (result.contract === "empty" && cfg.server) {
			log.error(`No Kizlo server found in ${cfg.server.entry}`)
			process.exit(1)
		}

		// Introspection-only: a package that ships procedures but no server. Name the file, since there is
		// no contract line to imply the generation happened. Nothing to report when it was skipped — the
		// note above already said so, and no file was touched.
		if (result.contract === "none") {
			if (result.introspection === "skipped") return
			const file = path.resolve(cwd, cfg.introspectionPath)
			log.success(`WordPress introspection ${result.introspection === "generated" ? "written to" : "already current at"} ${file}`)
			return
		}

		if (result.introspection === "generated") log.success("WordPress introspection generated")
		log.success("Contract generated")
	},
})
