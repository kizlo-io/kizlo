import fs from "node:fs"
import path from "node:path"
import { defineCommand } from "citty"
import { createTwoFilesPatch } from "diff"
import type { WordPressCredentials } from "../../wordpress/types"
import { resolveConfig } from "../daemon/config"
import { generateIntrospectionSource, reportGenerationError } from "../daemon/generate"
import { log } from "../daemon/logger"
import { testWordPressCredentials } from "./_test-wordpress"

export interface GeneratedFileMismatch {
	file: string
	actual: string
	expected: string
}

/** Compare generated output with every configured copy without changing the files. */
export function findGeneratedFileMismatches(files: string[], expected: string): GeneratedFileMismatch[] {
	const mismatches: GeneratedFileMismatch[] = []
	for (const file of files) {
		const actual = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : ""
		if (actual !== expected) mismatches.push({ file, actual, expected })
	}
	return mismatches
}

/** A standard unified diff, labelled so CI says which side is committed and which is current. */
export function formatGeneratedFileDiff(cwd: string, mismatch: GeneratedFileMismatch): string {
	const file = path.relative(cwd, mismatch.file) || path.basename(mismatch.file)
	return createTwoFilesPatch(file, file, mismatch.actual, mismatch.expected, "committed", "generated", { context: 3 })
}

/** The generated introspection the project configuration owns, if any. */
async function introspectionFiles(cwd: string, dir?: string): Promise<string[]> {
	const config = await resolveConfig(cwd, { dir })
	return config ? [path.resolve(cwd, config.introspectionPath)] : []
}

export const check = defineCommand({
	meta: {
		name: "check",
		description: "Check the Kizlo project without changing files",
	},
	args: {
		dir: {
			type: "string",
			description: "Override the Kizlo directory (defaults to kizlo.config.ts)",
		},
		test: {
			type: "boolean",
			description: "Check against WordPress left running by kizlo test",
		},
	},
	async run({ args }) {
		const cwd = process.cwd()
		const files = await introspectionFiles(cwd, args.dir)
		if (files.length === 0) {
			log.info("No generated WordPress introspection configured, nothing to check.")
			return
		}

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

		let expected: string
		try {
			expected = await generateIntrospectionSource(cwd, { credentials, strict: true })
		} catch (error) {
			reportGenerationError("Failed to check the generated WordPress introspection:", error)
			process.exitCode = 1
			return
		}

		const mismatches = findGeneratedFileMismatches(files, expected)
		if (mismatches.length === 0) {
			log.success("WordPress introspection is current")
			return
		}

		for (const mismatch of mismatches) {
			log.error(`${path.relative(cwd, mismatch.file)} is stale`)
			process.stderr.write(`${formatGeneratedFileDiff(cwd, mismatch)}\n`)
		}
		const command = ["kizlo generate", args.test ? "--test" : "", args.dir ? `--dir ${args.dir}` : ""].filter(Boolean).join(" ")
		log.info(`Run \`${command}\` and commit the updated introspection.`)
		process.exitCode = 1
	},
})
