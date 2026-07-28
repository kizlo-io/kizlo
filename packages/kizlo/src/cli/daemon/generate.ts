import fs from "node:fs"
import path from "node:path"
import { generateContract } from "../../shared/contract"
import type { AnyProcedureRouter } from "../../shared/procedure"
import { loadEnvFiles } from "../utils"
import type { ResolvedConfig } from "./config"
import { importIgnoringVirtualModules } from "./jiti"

/** The generated contract barrel — also written as a stub by `kizlo init`. */
export const CONTRACT_BARREL = [
	`import type { router } from ".."`,
	`import contractJson from "./contract.json"`,
	``,
	`export const contract = contractJson as unknown as typeof router`,
	``,
].join("\n")

/** Write atomically: a reader never observes a half-written file. */
function atomicWrite(file: string, data: string): void {
	const tmp = `${file}.${process.pid}.tmp`
	fs.writeFileSync(tmp, data)
	fs.renameSync(tmp, file)
}

/**
 * Loads the Kizlo server, builds its contract, and writes `contract.json` and
 * the generated barrel. Returns false when the entry has no Kizlo server.
 */
export async function generateOnce(cfg: ResolvedConfig): Promise<boolean> {
	loadEnvFiles(cfg.cwd)
	const entry = path.resolve(cfg.cwd, cfg.serverEntry)
	const { router } = await importIgnoringVirtualModules<{ router?: AnyProcedureRouter }>(cfg.cwd, entry)

	if (!router) return false

	const contract = JSON.stringify(await generateContract(router))

	fs.mkdirSync(path.resolve(cfg.cwd, cfg.generatedDir), { recursive: true })
	atomicWrite(path.resolve(cfg.cwd, cfg.contractPath), contract)
	atomicWrite(path.resolve(cfg.cwd, cfg.barrelPath), CONTRACT_BARREL)

	return true
}
