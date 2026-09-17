import { camel, endpointDefinition } from "../../wordpress/generate"
import type { IntrospectionDocument, IntrospectionOperation } from "../../wordpress/introspection"
import type { WP_EndpointDefinition } from "../../wordpress/types"

/** One callable WordPress operation, as the MCP tools see it. */
export interface McpRoute {
	/**
	 * How a tool call names this route. It is the path the generated client exposes the same operation
	 * at (`postTypes.book.list`), so an answer from a tool and the code a developer writes afterwards
	 * refer to the route by one name.
	 */
	name: string
	/** The REST namespace the route belongs to (`wp/v2`, `kizlo/v1`, `wc/v3`), which filters a listing. */
	namespace: string
	method: string
	path: string
	summary?: string
	description?: string
	deprecated?: boolean
	operation: IntrospectionOperation
	definition: WP_EndpointDefinition
}

/**
 * Every operation in the document, keyed by route name.
 *
 * Built per call rather than cached: the watcher replaces the document whenever WordPress moves, and
 * a registry that outlived one would answer for routes that no longer exist while missing the ones
 * that just appeared. Walking a contract of a few hundred routes is far cheaper than getting that wrong.
 */
export function routesOf(document: IntrospectionDocument): Map<string, McpRoute> {
	const routes = new Map<string, McpRoute>()
	for (const [apiId, api] of Object.entries(document.apis)) {
		const prefix = apiId.split(".").map(camel)
		for (const [path, operations] of Object.entries(api.paths)) {
			for (const [operationId, operation] of Object.entries(operations)) {
				const name = [...prefix, camel(operationId)].join(".")
				routes.set(name, {
					name,
					namespace: api.namespace,
					method: operation.method,
					path,
					...(operation.summary !== undefined ? { summary: operation.summary } : {}),
					...(operation.description !== undefined ? { description: operation.description } : {}),
					...(operation.deprecated !== undefined ? { deprecated: operation.deprecated } : {}),
					operation,
					definition: endpointDefinition({ namespace: api.namespace, path, operation }),
				})
			}
		}
	}
	return routes
}

/** Route names in the order a listing shows them, so two calls against one document agree. */
export function sortRoutes(routes: Iterable<McpRoute>): McpRoute[] {
	return [...routes].sort((left, right) => left.name.localeCompare(right.name))
}
