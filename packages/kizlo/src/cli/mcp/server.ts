import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import z from "zod/v4"
import { log } from "../daemon/logger"
import type { SearchMatch } from "./search"
import type { McpState } from "./state"
import { callRoute, describeRoute, searchRoutes, type ToolResult } from "./tools"

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

/**
 * Render a tool's answer for both kinds of reader: `structuredContent` for a client that parses, and
 * a text block for one that does not.
 *
 * A failure carries no `structuredContent`. A client validates whatever it finds there against the
 * tool's declared output schema whether or not the result is an error, and a failure is not that
 * shape, so putting it there makes a client reject the answer outright instead of reading it. The
 * detail rides in a second text block, which keeps it machine-readable without breaking the contract.
 */
function toolContent(
	result: ToolResult,
	summarize: (value: unknown) => string = (value) => JSON.stringify(value, null, 2),
): {
	content: { type: "text"; text: string }[]
	structuredContent?: Record<string, unknown>
	isError?: boolean
} {
	if (!result.ok) {
		return {
			content: [
				{ type: "text", text: result.error.message },
				{ type: "text", text: JSON.stringify(result.error, null, 2) },
			],
			isError: true,
		}
	}
	return {
		content: [{ type: "text", text: summarize(result.value) }],
		structuredContent: result.value as Record<string, unknown>,
	}
}

/**
 * The one result long enough to be worth compressing. Describe and call put their payload in the
 * text block because the payload is the answer; a ranked list is better read than parsed.
 */
function summarizeSearch(value: unknown): string {
	const outcome = value as { count: number; routes: SearchMatch[]; nextCursor?: string; message?: string }
	if (outcome.count === 0) return outcome.message ?? "No route matches that search."

	const lines = outcome.routes.map((route) => {
		const evidence = route.evidence.map((item) => `${item.field}:${item.term}`).join(", ")
		const summary = route.summary === undefined ? "" : ` — ${route.summary}`
		const deprecated = route.deprecated ? " (deprecated)" : ""
		return `${route.name} — ${route.method} ${route.path}${summary}${deprecated}${evidence === "" ? "" : ` [${evidence}]`}`
	})
	const more =
		outcome.nextCursor === undefined
			? ""
			: `\n${outcome.count - outcome.routes.length} more. Pass cursor "${outcome.nextCursor}" for the next page.`

	return `${outcome.count} route${outcome.count === 1 ? "" : "s"} match:\n${lines.join("\n")}${more}`
}

/** A ranked result, and the named part of the contract that selected it. */
const SEARCH_OUTPUT = {
	count: z.number().describe("Matches across the whole catalog, not just this page."),
	routes: z.array(
		z.object({
			name: z.string(),
			namespace: z.string(),
			method: z.string(),
			path: z.string(),
			summary: z.string().optional(),
			deprecated: z.literal(true).optional(),
			evidence: z.array(z.object({ field: z.string(), term: z.string() })),
		}),
	),
	namespaces: z.array(z.string()).describe("Every REST namespace this WordPress serves."),
	nextCursor: z.string().optional().describe("Hand back as `cursor` to read the next page."),
	message: z.string().optional().describe("Present only when nothing matched."),
}

const DESCRIBE_OUTPUT = {
	name: z.string(),
	namespace: z.string(),
	method: z.string(),
	path: z.string(),
	summary: z.string().optional(),
	description: z.string().optional(),
	deprecated: z.literal(true).optional(),
	pathParameters: z.array(z.string()),
	input: z.record(z.string(), z.unknown()).describe("JSON Schema for `{ params, query, body }`, with its `$defs`."),
	responses: z.record(z.string(), z.unknown()).describe("Keyed by HTTP status."),
	errors: z.array(z.string()).describe("Error codes this route declares."),
}

/**
 * Deliberately permissive. The SDK validates `structuredContent` against this on every successful
 * call, so anything narrower would turn a route whose response does not fit into a protocol error
 * rather than an answer.
 */
const CALL_OUTPUT = {
	status: z.number(),
	data: z.unknown().optional(),
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
		{
			instructions: [
				"Read and change the WordPress of the Kizlo project this server was started in.",
				"Every REST route that WordPress exposes is reachable here — core, Kizlo's own, and any plugin's — through three tools rather than one tool per route.",
				"Work in that order: `kizlo_search_routes` to find a route, `kizlo_describe_route` to read its contract, `kizlo_call` to run it.",
				"Describe a route before calling it unless you already know its contract. Arguments are grouped into `params`, `query`, and `body`, and the description says which fields belong where.",
				"API errors are passed through unchanged: the code, message, and data are WordPress's own, not this server's summary of them.",
			].join(" "),
		},
	)

	server.registerTool(
		"kizlo_search_routes",
		{
			title: "Search WordPress routes",
			description:
				"Find routes by identity or by meaning: a route name, path, or namespace, or terms from a route's arguments, response fields, description, or error codes. Start here. Omit `query` to browse the whole catalog. Each result names the evidence that selected it, and the route names it returns are what `kizlo_describe_route` and `kizlo_call` take.",
			inputSchema: {
				query: z.string().optional().describe("Terms to rank on. Omit or leave empty to browse every route."),
				namespace: z.string().optional().describe('Only routes in this REST namespace, e.g. "wp/v2" or "kizlo/v1".'),
				method: z.string().optional().describe('Only routes served with this HTTP method, e.g. "GET".'),
				access: z.enum(["read", "write"]).optional().describe("Only reading routes (GET, HEAD, OPTIONS) or only writing ones."),
				limit: z.number().int().optional().describe("Results per page. Defaults to 20, at most 100."),
				cursor: z.string().optional().describe("The `nextCursor` from a previous search, to read the next page."),
			},
			outputSchema: SEARCH_OUTPUT,
		},
		async (input) => toolContent(searchRoutes(state, input), summarizeSearch),
	)

	server.registerTool(
		"kizlo_describe_route",
		{
			title: "Describe a WordPress route",
			description:
				"The complete contract for one route: the JSON Schema for its `params`, `query`, and `body`, with the definitions they reference; the response schema for each HTTP status, with content types and headers; which arguments are interpolated into the path; and the error codes the route declares.",
			inputSchema: { route: z.string().describe("A route name from `kizlo_search_routes`, e.g. `kizlo.postTypes.book.list`.") },
			outputSchema: DESCRIBE_OUTPUT,
		},
		async ({ route }) => toolContent(describeRoute(state, { route })),
	)

	server.registerTool(
		"kizlo_call",
		{
			title: "Call a WordPress route",
			description:
				"Run one route against this project's WordPress and return its response. Arguments go in `input` under the part they belong to: `params` for the values interpolated into the path, `query` for query parameters, and `body` for the payload. `kizlo_describe_route` says which are which.",
			inputSchema: {
				route: z.string().describe("A route name from `kizlo_search_routes`."),
				input: z
					.object({
						params: z.record(z.string(), z.unknown()).optional().describe("Values interpolated into the path."),
						query: z.record(z.string(), z.unknown()).optional().describe("Query parameters."),
						body: z.unknown().optional().describe("The request payload."),
					})
					.optional()
					.describe("The route's arguments, grouped as `kizlo_describe_route` describes them."),
			},
			outputSchema: CALL_OUTPUT,
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
