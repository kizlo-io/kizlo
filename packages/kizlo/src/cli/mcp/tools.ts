import { buildWordPressRequest } from "../../wordpress/endpoint"
import { WordPressTransport } from "../../wordpress/transport"
import { routesOf, sortRoutes } from "./routes"
import { toJsonSchema } from "./schema"
import type { McpState } from "./state"

/**
 * What a tool answers with: a value to serialize, or a message explaining why there is none. Errors
 * are returned rather than thrown so the server reports them as tool failures the model can act on,
 * which is the difference between an agent correcting a route name and an agent seeing a stack trace.
 */
export type ToolResult = { ok: true; value: unknown } | { ok: false; error: string }

/** The document is fetched by the watcher, so the only reason it is missing is that none has arrived yet. */
const NO_DOCUMENT = "The WordPress contract has not been fetched yet. Retry in a moment; `kizlo dev` refreshes it every few seconds."

/** Summaries only. The schemas behind these routes are far too large to put in front of a model at once. */
export function listRoutes(state: McpState, input: { namespace?: string } = {}): ToolResult {
	if (!state.document) return { ok: false, error: NO_DOCUMENT }

	const all = sortRoutes(routesOf(state.document).values())
	const routes = input.namespace ? all.filter((route) => route.namespace === input.namespace) : all

	if (input.namespace && routes.length === 0) {
		const known = [...new Set(all.map((route) => route.namespace))].sort()
		return { ok: false, error: `No routes in namespace "${input.namespace}". This WordPress serves: ${known.join(", ")}.` }
	}

	return {
		ok: true,
		value: {
			count: routes.length,
			routes: routes.map((route) => ({
				name: route.name,
				namespace: route.namespace,
				method: route.method,
				path: route.path,
				...(route.summary !== undefined ? { summary: route.summary } : {}),
				...(route.deprecated ? { deprecated: true } : {}),
			})),
		},
	}
}

/** The full argument schema for one route, which is what a caller needs before it can build a call. */
export function describeRoute(state: McpState, input: { route: string }): ToolResult {
	if (!state.document) return { ok: false, error: NO_DOCUMENT }

	const route = routesOf(state.document).get(input.route)
	if (!route) return { ok: false, error: unknownRoute(input.route) }

	return {
		ok: true,
		value: {
			name: route.name,
			namespace: route.namespace,
			method: route.method,
			path: route.path,
			...(route.summary !== undefined ? { summary: route.summary } : {}),
			...(route.description !== undefined ? { description: route.description } : {}),
			...(route.deprecated ? { deprecated: true } : {}),
			// Named separately because they read as ordinary fields in the schema: they are interpolated
			// into the path rather than sent as a query or a body, so a caller must supply every one.
			pathParameters: route.definition.pathParameters,
			input: toJsonSchema(route.operation.input, state.document),
		},
	}
}

/** Run one route against the connected WordPress and hand back what it answered. */
export async function callRoute(state: McpState, input: { route: string; input?: Record<string, unknown> }): Promise<ToolResult> {
	if (!state.document) return { ok: false, error: NO_DOCUMENT }
	if (!state.credentials) {
		return { ok: false, error: "No WordPress connection is configured, so nothing can be called. Check the connection settings in `.env`." }
	}

	const route = routesOf(state.document).get(input.route)
	if (!route) return { ok: false, error: unknownRoute(input.route) }

	const built = buildWordPressRequest(route.definition, input.input ?? {})
	if (built.error) return { ok: false, error: built.error.message }

	const transport = new WordPressTransport({ credentials: state.credentials })
	const response = await transport.request(built.request)

	if (response.error) {
		return {
			ok: false,
			error: `${route.method} ${route.path} failed (${response.status || "no response"}): ${response.error.code} — ${response.error.message}`,
		}
	}

	return { ok: true, value: { status: response.status, data: response.data } }
}

function unknownRoute(name: string): string {
	return `No route named "${name}" in this WordPress contract. Call \`kizlo_list_routes\` for the routes it serves.`
}
