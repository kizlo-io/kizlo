import type { IntrospectionDocument } from "../../wordpress/introspection"
import type { WordPressCredentials } from "../../wordpress/types"

/**
 * What the watcher knows and the MCP server serves, as one mutable object rather than two copies.
 *
 * The server binds once per session while the watcher restarts on every `.env` or config change, so
 * anything the server captured at start would be the previous session's by the time a tool ran. The
 * watcher writes here on each start and on every poll that returns a document; the server reads per
 * call. Credentials matter most: a `.env` change is exactly when the connection may have moved.
 */
export interface McpState {
	/** The most recent introspection document, or undefined before the first fetch answers. */
	document?: IntrospectionDocument
	/** The connection tool calls travel over, or undefined when none could be resolved. */
	credentials?: WordPressCredentials
}

export function createMcpState(): McpState {
	return {}
}
