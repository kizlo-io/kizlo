import fs from "node:fs"
import path from "node:path"
import { createJiti } from "jiti"
import type { KizloConfig } from "../../config"

export interface ResolvedConfig {
	cwd: string
	/** Kizlo's home directory. */
	dir: string
	serverDir: string
	serverEntry: string
	generatedDir: string
	contractPath: string
	barrelPath: string
}

const CONFIG_FILES = ["kizlo.config.ts", "kizlo.config.js", "kizlo.config.mjs"]

function defaultDir(cwd: string): string {
	return fs.existsSync(path.join(cwd, "src")) ? "src/lib/kizlo" : "lib/kizlo"
}

async function loadConfigFile(cwd: string): Promise<KizloConfig | undefined> {
	const file = CONFIG_FILES.map((name) => path.join(cwd, name)).find((p) => fs.existsSync(p))
	if (!file) return undefined

	const jiti = createJiti(cwd, { moduleCache: false })
	const mod = await jiti.import<{ default?: KizloConfig } & KizloConfig>(file)
	return mod.default ?? mod
}

export async function resolveConfig(cwd: string, flags?: { dir?: string }): Promise<ResolvedConfig> {
	const fileConfig = await loadConfigFile(cwd)
	const raw = flags?.dir ?? fileConfig?.dir ?? defaultDir(cwd)
	const dir = raw.replace(/^\.\//, "").replace(/\/+$/, "")
	const serverDir = path.join(dir, "server")
	const generatedDir = path.join(serverDir, "generated")

	return {
		cwd,
		dir,
		serverDir,
		serverEntry: path.join(serverDir, "index.ts"),
		generatedDir,
		contractPath: path.join(generatedDir, "contract.json"),
		barrelPath: path.join(generatedDir, "index.ts"),
	}
}
