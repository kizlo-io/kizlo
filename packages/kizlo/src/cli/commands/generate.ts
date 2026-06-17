import { defineCommand } from "citty"
import { resolveConfig } from "../daemon/config"
import { generateOnce } from "../daemon/generate"
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
		const cfg = await resolveConfig(cwd, { dir: args.dir })
		const ok = await generateOnce(cfg)
		if (!ok) {
			log.error(`No Kizlo server found in ${cfg.serverEntry}`)
			process.exit(1)
		}
		log.success("Contract generated")
	},
})
