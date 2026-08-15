import type { WordPressTransport } from "./transport"
import type { WP_CallOptions, WP_Client, WP_Endpoint, WP_EndpointDefinition, WP_RequestInput } from "./types"

/**
 * One generated endpoint, as data. The two type parameters are phantom, so this is the definition
 * itself rather than anything that wraps it, and nothing about the connection is bound: an endpoint
 * is inert until a transport runs it.
 */
export function wpEndpoint<TInput, TResult>(definition: WP_EndpointDefinition): WP_Endpoint<TInput, TResult> {
	return definition
}

/** Turn a definition and its input into a request: interpolate path parameters, then split the rest. */
export function buildWordPressRequest(definition: WP_EndpointDefinition, input: object): WP_RequestInput {
	let path = definition.path
	const rest: Record<string, unknown> = { ...input }
	for (const name of definition.pathParameters) {
		if (!(name in rest)) throw new Error(`Missing WordPress path parameter "${name}".`)
		const encoded = encodeURIComponent(String(rest[name]))
		const marker = `{${name}}`
		while (path.includes(marker)) path = path.replace(marker, encoded)
		delete rest[name]
	}

	const hasBody = ["POST", "PUT", "PATCH"].includes(definition.method)
	return {
		base: `/wp-json/${definition.namespace}`,
		path,
		method: definition.method,
		...(hasBody ? { body: rest, requestContentType: definition.requestContentType } : { searchParams: rest }),
		responseContentTypes: definition.responseContentTypes,
	}
}

/**
 * Endpoints and namespace nodes are both plain objects, so the tree is walked by asking whether a
 * node carries a definition. Testing the member types rather than their presence is what makes this
 * exact: a namespace whose children happen to be named `method` and `pathParameters` holds endpoint
 * objects under those keys, never a string and an array.
 */
function isEndpoint(value: object): value is WP_EndpointDefinition {
	const candidate = value as Partial<WP_EndpointDefinition>
	return typeof candidate.method === "string" && Array.isArray(candidate.pathParameters)
}

function createCaller(definition: WP_EndpointDefinition, transport: WordPressTransport) {
	return async (input: object = {}, options?: WP_CallOptions) => {
		return transport.request({ ...buildWordPressRequest(definition, input), ...options })
	}
}

/** A transport member, bound so it still works once read off the proxy rather than the transport. */
function transportMember(transport: WordPressTransport, key: PropertyKey): unknown {
	const value = (transport as unknown as Record<PropertyKey, unknown>)[key]
	return typeof value === "function" ? value.bind(transport) : value
}

/**
 * Resolves lazily rather than walking the tree up front: a serverless invocation reloads the module
 * and touches one or two endpoints, so binding all of them on every cold start is work thrown away.
 * Each node memoizes what it hands back, so repeated access costs one map lookup.
 */
function proxyNode(node: object, transport: WordPressTransport, root: boolean): unknown {
	const cache = new Map<PropertyKey, unknown>()

	return new Proxy(node, {
		get(target, key, receiver) {
			if (cache.has(key)) return cache.get(key)

			const value = Reflect.get(target, key, receiver)
			let resolved: unknown
			if (value !== null && typeof value === "object") {
				resolved = isEndpoint(value) ? createCaller(value, transport) : proxyNode(value, transport, false)
			}
			// Endpoints shadow the transport, so this only runs for a key the generated tree lacks:
			// `get`, `post`, `resolveList` and the rest stay reachable on the client an extension holds.
			else if (value === undefined && root) resolved = transportMember(transport, key)
			else resolved = value

			cache.set(key, resolved)
			return resolved
		},
		has(target, key) {
			return key in target || (root && key in (transport as object))
		},
	})
}

export function createWordPressClient<TEndpoints extends object>(
	transport: WordPressTransport,
	endpoints: TEndpoints,
): WP_Client<TEndpoints> & WordPressTransport {
	return proxyNode(endpoints, transport, true) as WP_Client<TEndpoints> & WordPressTransport
}
