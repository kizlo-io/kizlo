import type { ResolvedMcpConfig } from "../daemon/config"
import { log } from "../daemon/logger"
import { pickStackPort } from "../utils"
import { MCP_HOST, type McpServerHandle, startMcpServer } from "./server"
import type { McpState } from "./state"

export { isAllowedOrigin, MCP_HOST, MCP_PATH, type McpServerHandle } from "./server"
export { createMcpState, type McpState } from "./state"

/**
 * The port the server will bind, stepping off a collision unless the project pinned one.
 *
 * Resolved before the server starts so the dev summary can print the address alongside WordPress's.
 * A pinned port that is taken stops the command the way `dev.port` and `test.port` do: the developer
 * wrote that number, a harness config elsewhere names it, and quietly serving on a different one
 * would leave the harness connecting to nothing.
 */
export async function resolveMcpPort(config: ResolvedMcpConfig): Promise<number> {
	return pickStackPort(config.port, { fixed: config.portExplicit, host: MCP_HOST, configKey: "mcp.port" })
}

/**
 * Start the MCP server for a session that has a watcher, or say why it is not running.
 *
 * Called after the watcher starts and never inside its restart cycle. Two cases leave it off, and
 * neither is a failure of the session: another `kizlo dev` already holds the watcher lock and is
 * serving MCP itself (the caller skips this entirely), or there is no WordPress connection to expose,
 * where the contract watcher still has work to do and MCP has nothing to answer with.
 */
export async function startMcp(state: McpState, port: number): Promise<McpServerHandle | undefined> {
	if (!state.credentials) {
		log.info("No WordPress connection configured; the MCP server is off for this session.")
		return undefined
	}

	try {
		const handle = await startMcpServer(state, { port })
		log.success(`MCP server on ${handle.url}`)
		return handle
	} catch (error) {
		log.error("Failed to start the MCP server:", error)
		return undefined
	}
}
