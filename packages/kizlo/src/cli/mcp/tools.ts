import { buildWordPressRequest } from "../../wordpress/endpoint"
import type { IntrospectionDocument, IntrospectionResponse } from "../../wordpress/introspection"
import { WordPressTransport } from "../../wordpress/transport"
import { routesOf } from "./routes"
import { inputJsonSchema, type JsonSchema, toJsonSchema } from "./schema"
import { searchRoutes as rankRoutes, type SearchOptions } from "./search"
import type { McpState } from "./state"

/**
 * Why a call produced no value.
 *
 * `request` is a failure this server caused before WordPress was reached; `response` is what
 * WordPress itself refused, carried through unchanged so a caller reads the code, message, and
 * `data` the API returned rather than a sentence assembled out of them. Keeping the two apart is
 * what lets an agent tell a call it built wrong from a call the API declined.
 */
export type ToolFailure =
	| { kind: "request"; message: string }
	| { kind: "response"; message: string; route: string; method: string; path: string; status: number; error: unknown }

/**
 * What a tool answers with: a value to serialize, or a failure explaining why there is none. Errors
 * are returned rather than thrown so the server reports them as tool failures the model can act on,
 * which is the difference between an agent correcting a route name and an agent seeing a stack trace.
 */
export type ToolResult = { ok: true; value: unknown } | { ok: false; error: ToolFailure }

/** The document is fetched by the watcher, so the only reason it is missing is that none has arrived yet. */
const NO_DOCUMENT = "The WordPress contract has not been fetched yet. Retry in a moment; `kizlo dev` refreshes it every few seconds."

function failed(message: string): ToolResult {
	return { ok: false, error: { kind: "request", message } }
}

/**
 * Rank the routes this WordPress serves against a query, or browse them all when there is none.
 *
 * Summaries and match evidence only. The schemas behind these routes are far too large to put in
 * front of a model at once, which is what `kizlo_describe_route` is for.
 */
export function searchRoutes(state: McpState, input: SearchOptions = {}): ToolResult {
	if (!state.document) return failed(NO_DOCUMENT)

	const outcome = rankRoutes(state.document, input)

	// No guess: a route named confidently but wrongly costs more than an empty answer. The reply keeps
	// the same shape either way, and only adds what would help the caller search again.
	if (outcome.count === 0) {
		const within = [
			input.namespace !== undefined ? `namespace "${input.namespace}"` : undefined,
			input.method !== undefined ? `method ${input.method.toUpperCase()}` : undefined,
			input.access !== undefined ? `${input.access} routes` : undefined,
		]
			.filter((part) => part !== undefined)
			.join(", ")

		return {
			ok: true,
			value: {
				...outcome,
				message:
					`No route matches that search${within === "" ? "" : ` within ${within}`}.` +
					` This WordPress serves these namespaces: ${outcome.namespaces.join(", ")}.`,
			},
		}
	}

	return { ok: true, value: outcome }
}

/** The full contract for one route, which is what a caller needs before it can build a call. */
export function describeRoute(state: McpState, input: { route: string }): ToolResult {
	if (!state.document) return failed(NO_DOCUMENT)

	const route = routesOf(state.document).get(input.route)
	if (!route) return failed(unknownRoute(input.route))

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
			// Repeated from `input.params` because every one of them must be supplied: the path cannot be
			// built without them, where a query or body field is only as required as the schema says.
			pathParameters: route.definition.pathParameters,
			input: inputJsonSchema(route.operation.input, state.document),
			responses: responseSchemas(route.operation.responses, state.document),
			// Bare codes are all the document carries, so bare codes are all that is returned.
			errors: route.operation.errors,
		},
	}
}

/** Run one route against the connected WordPress and hand back what it answered. */
export async function callRoute(state: McpState, input: { route: string; input?: Record<string, unknown> }): Promise<ToolResult> {
	if (!state.document) return failed(NO_DOCUMENT)
	if (!state.credentials) {
		return failed("No WordPress connection is configured, so nothing can be called. Check the connection settings in `.env`.")
	}

	const route = routesOf(state.document).get(input.route)
	if (!route) return failed(unknownRoute(input.route))

	const built = buildWordPressRequest(route.definition, input.input ?? {})
	if (built.error) return failed(built.error.message)

	const transport = new WordPressTransport({ credentials: state.credentials })
	const response = await transport.request(built.request)

	if (response.error) {
		return {
			ok: false,
			error: {
				kind: "response",
				message: `${route.method} ${route.path} failed (${response.status || "no response"}): ${response.error.code} — ${response.error.message}`,
				route: route.name,
				method: route.method,
				path: route.path,
				status: response.status,
				// Exactly what WordPress answered, and nothing invented: `data` is where its field-level
				// detail lives. Rebuilt as a plain object rather than passed through, because `WP_Error`
				// keeps its message on `Error`, where it is not enumerable and would be dropped the moment
				// the failure is serialized to the client.
				error: { code: response.error.code, message: response.error.message, data: response.error.data },
			},
		}
	}

	return { ok: true, value: { status: response.status, data: response.data } }
}

/** The response half of the contract, converted so a caller can read a success or a failure body. */
function responseSchemas(responses: Record<string, IntrospectionResponse>, document: IntrospectionDocument): Record<string, JsonSchema> {
	return Object.fromEntries(
		Object.entries(responses).map(([status, response]) => [
			status,
			{
				...(response.description !== undefined ? { description: response.description } : {}),
				...(response.content_type !== undefined ? { content_type: response.content_type } : {}),
				...(response.headers ? { headers: toJsonSchema(response.headers, document) } : {}),
				...(response.body ? { body: toJsonSchema(response.body, document) } : {}),
			},
		]),
	)
}

function unknownRoute(name: string): string {
	return `No route named "${name}" in this WordPress contract. Call \`kizlo_search_routes\` for the routes it serves.`
}
