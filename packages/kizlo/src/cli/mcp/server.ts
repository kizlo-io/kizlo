import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import z from "zod/v4"
import { log } from "../daemon/logger"
import type { McpState } from "./state"
import { callRoute, describeRoute, listRoutes, type ToolResult } from "./tools"

/** The only interface the server is ever bound to. Never `0.0.0.0`: this is a developer's machine. */
export const MCP_HOST = "127.0.0.1"

/** The one path the server answers on, so a harness config is a URL rather than a URL and a note. */
export const MCP_PATH = "/mcp"

/** Hosts an `Origin` may name. Everything the loopback interface is reachable as, and nothing else. */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "[::1]", "localhost"])

/**
 * Whether a request's `Origin` may be served.
 *
 * Binding to loopback keeps other machines out, but not the developer's own browser: a page on any
 * site can `fetch` `http://127.0.0.1`, and while CORS stops it reading the reply, a request that
 * changes WordPress has already happened by then. The MCP specification requires HTTP transports to
 * check `Origin` for exactly this, so a page that names itself is refused before it reaches a tool.
 *
 * No `Origin` is allowed, because that is what a native MCP client sends. Browsers attach the header
 * to cross-origin requests themselves and cannot forge it, so its absence is not something an attacking
 * page can arrange.
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
	if (origin === undefined || origin === "") return true
	// `null` is what a sandboxed or `file://` document sends. It names no host that can be checked.
	if (origin === "null") return false
	try {
		return LOOPBACK_HOSTS.has(new URL(origin).hostname)
	} catch {
		return false
	}
}

export interface McpServerHandle {
	/** The address to put in a harness's MCP configuration. */
	url: string
	port: number
	stop: () => Promise<void>
}

/** Render a tool's answer as the MCP content block a client reads, failures included. */
function toolContent(result: ToolResult): { content: { type: "text"; text: string }[]; isError?: boolean } {
	if (!result.ok) return { content: [{ type: "text", text: result.error }], isError: true }
	return { content: [{ type: "text", text: JSON.stringify(result.value, null, 2) }] }
}

/**
 * Three dispatchers rather than a tool per route. The contract a seeded WordPress serves runs to well
 * over a hundred routes, and putting their schemas in front of a model up front would cost tens of
 * thousands of tokens in every message. These cost a few hundred and reach all of them — and because
 * they read the document per call, a route registered while `kizlo dev` runs is callable without
 * re-registering anything.
 */
function createMcpServer(state: McpState): McpServer {
	const server = new McpServer(
		{ name: "kizlo", version: "1.0.0" },
		{ instructions: "Read and call the WordPress REST routes of the Kizlo project this server was started in." },
	)

	server.registerTool(
		"kizlo_list_routes",
		{
			title: "List WordPress routes",
			description:
				"List every REST route this project's WordPress serves, with its method and summary. Start here: the route names it returns are what `kizlo_describe_route` and `kizlo_call` take.",
			inputSchema: { namespace: z.string().optional().describe('Only routes in this REST namespace, e.g. "wp/v2" or "kizlo/v1".') },
		},
		async ({ namespace }) => toolContent(listRoutes(state, namespace === undefined ? {} : { namespace })),
	)

	server.registerTool(
		"kizlo_describe_route",
		{
			title: "Describe a WordPress route",
			description: "The JSON Schema for one route's arguments, plus which of them are interpolated into its path.",
			inputSchema: { route: z.string().describe("A route name from `kizlo_list_routes`, e.g. `kizlo.postTypes.book.list`.") },
		},
		async ({ route }) => toolContent(describeRoute(state, { route })),
	)

	server.registerTool(
		"kizlo_call",
		{
			title: "Call a WordPress route",
			description:
				"Run one route against this project's WordPress and return its response. Path parameters, query parameters, and body fields all go in `input`; `kizlo_describe_route` says which are which.",
			inputSchema: {
				route: z.string().describe("A route name from `kizlo_list_routes`."),
				input: z.record(z.string(), z.unknown()).optional().describe("The route's arguments, as described by `kizlo_describe_route`."),
			},
		},
		async ({ route, input }) => toolContent(await callRoute(state, input === undefined ? { route } : { route, input })),
	)

	return server
}

/**
 * Bind the MCP server for this session.
 *
 * It binds once and stays bound. The contract watcher restarts whenever `.env` or a config file
 * changes, and tying the socket to that cycle would drop the harness's connection on every save and
 * race the rebind against a port the previous listener had not finished releasing. Nothing here is
 * captured from the watcher either: `state` is read per tool call, so a reload that changes the
 * WordPress connection takes effect on the next call without rebinding anything.
 */
export async function startMcpServer(state: McpState, options: { port: number }): Promise<McpServerHandle> {
	const server = createServer((request: IncomingMessage, response: ServerResponse) => {
		if (!isAllowedOrigin(request.headers.origin)) {
			response.writeHead(403, { "content-type": "application/json" })
			response.end(JSON.stringify({ error: `Refused an MCP request from origin ${request.headers.origin}.` }))
			return
		}

		const { pathname } = new URL(request.url ?? "/", `http://${MCP_HOST}`)
		if (pathname !== MCP_PATH) {
			response.writeHead(404, { "content-type": "application/json" })
			response.end(JSON.stringify({ error: `Nothing is served at ${pathname}. The MCP endpoint is ${MCP_PATH}.` }))
			return
		}

		void dispatch(request, response, state)
	})

	await new Promise<void>((resolve, reject) => {
		server.once("error", reject)
		server.listen(options.port, MCP_HOST, () => {
			server.removeListener("error", reject)
			// Nothing else handles an error once the bind has succeeded, and an unhandled `error` event is
			// an uncaught exception: a socket problem on this optional listener would end the dev session,
			// Docker teardown and all.
			server.on("error", (error) => log.error("MCP server error:", error))
			resolve()
		})
	})

	// Read back rather than echoed: port 0 asks the OS to choose one, which the tests rely on and a
	// caller has no other way to learn.
	const address = server.address()
	const port = typeof address === "object" && address !== null ? address.port : options.port

	return {
		url: `http://${MCP_HOST}:${port}${MCP_PATH}`,
		port,
		stop: () => stopServer(server),
	}
}

/**
 * Answer one request with a server and transport of its own.
 *
 * Stateless, with plain JSON replies: a dev session has exactly one harness attached and nothing to
 * remember between its calls, so there is no session to track and no reason to hold an event stream
 * open. Per request rather than shared, because a stateless transport carries the state of the one
 * exchange it was built for and cannot answer a second. Building three tools again each time costs
 * nothing next to the request, and it is what keeps the tools reading the current `state`.
 */
async function dispatch(request: IncomingMessage, response: ServerResponse, state: McpState): Promise<void> {
	const mcp = createMcpServer(state)
	const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true })
	response.on("close", () => {
		void transport.close()
		void mcp.close()
	})
	await mcp.connect(transport)
	await transport.handleRequest(request, response)
}

async function stopServer(server: Server): Promise<void> {
	await new Promise<void>((resolve) => {
		server.close(() => resolve())
		// A harness holds its connection open, and `close` waits for every one of them to end. The
		// session is already over by the time this runs, so the sockets are dropped rather than waited on.
		server.closeAllConnections()
	})
}
