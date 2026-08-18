import { WP_Error } from "./error"
import type { WordPressTransport } from "./transport"
import type { WP_CallOptions, WP_Client, WP_Endpoint, WP_EndpointDefinition, WP_RequestBuild } from "./types"

/**
 * One generated endpoint, as data. The two type parameters are phantom, so this is the definition
 * itself rather than anything that wraps it, and nothing about the connection is bound: an endpoint
 * is inert until a transport runs it.
 */
export function wpEndpoint<TInput, TResult>(definition: WP_EndpointDefinition): WP_Endpoint<TInput, TResult> {
	return definition
}

/**
 * What a path segment can be built from. Everything else names a different resource once it is in
 * the URL rather than failing loudly: `undefined` and `null` interpolate as those literal words, an
 * empty string collapses the segment so a retrieve resolves to the collection route beside it, and a
 * symbol throws on conversion. `0` stays valid, because a route matching digits can be asked for it.
 */
function isUsablePathParameter(value: unknown): value is string | number | bigint {
	if (typeof value === "string") return value !== ""
	if (typeof value === "number") return Number.isFinite(value)
	return typeof value === "bigint"
}

/** Names what arrived without converting it, since `String()` throws on a symbol. */
function describeValue(value: unknown): string {
	if (value === null) return "null"
	if (typeof value === "string") return "an empty string"
	if (typeof value === "number") return String(value)
	return typeof value
}

/**
 * Turn a definition and its input into a request: interpolate path parameters, then split the rest.
 *
 * A path parameter that cannot be interpolated comes back as an error rather than throwing. The
 * generated input marks these required, so TypeScript catches the ones it can see, and what reaches
 * here is the value that was present but unusable — typically an identifier read off a request the
 * caller never validated.
 */
export function buildWordPressRequest(definition: WP_EndpointDefinition, input: object): WP_RequestBuild {
	let path = definition.path
	const rest: Record<string, unknown> = { ...input }
	for (const name of definition.pathParameters) {
		const value = rest[name]
		if (!isUsablePathParameter(value)) {
			const message = `WordPress path parameter "${name}" must be a non-empty string or a finite number, received ${describeValue(value)}.`
			return { request: null, error: new WP_Error({ code: "invalid_path_parameter", message }) }
		}

		const encoded = encodeURIComponent(String(value))
		const marker = `{${name}}`
		while (path.includes(marker)) path = path.replace(marker, encoded)
		delete rest[name]
	}

	const hasBody = ["POST", "PUT", "PATCH"].includes(definition.method)
	return {
		request: {
			base: `/wp-json/${definition.namespace}`,
			path,
			method: definition.method,
			...(hasBody ? { body: rest, requestContentType: definition.requestContentType } : { searchParams: rest }),
			responseContentTypes: definition.responseContentTypes,
		},
		error: null,
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
		const built = buildWordPressRequest(definition, input)
		// Nothing was sent, so this reports the shape a transport failure has: status 0, no headers.
		if (built.error) return { data: null, status: 0, headers: new Headers(), error: built.error }

		return transport.request({ ...built.request, ...options })
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
