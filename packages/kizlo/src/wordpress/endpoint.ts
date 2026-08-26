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
 * Keys that must not become a missing-endpoint node, whatever the tree holds. A symbol is never an
 * endpoint name, and `then` decides whether a value is a thenable: handing the promise machinery a
 * function that resolves to a result rather than calling back would hang an `await` on the node
 * forever. Both resolve to `undefined`, which is what they did before any of this existed.
 */
function isInertKey(key: PropertyKey): boolean {
	return typeof key === "symbol" || key === "then"
}

/**
 * Stands in for a path the generated tree does not have, so the failure names the path instead of
 * arriving as `undefined` and becoming `is not a function` two property accesses later.
 *
 * It keeps proxying, because the absent key can be a whole subtree rather than the leaf: `postTypes`
 * going missing has to survive `.post.list` before anything is called. Calling it resolves to the
 * shape a request that never left already has, so a caller branches on `response.error` for this the
 * way it does for a path parameter that could not be interpolated.
 *
 * Why the path is absent is not knowable from here. It is a post type or taxonomy whose API access
 * was switched off, a plugin that is missing or predates the contract, or a generated client built
 * against a different WordPress, and the client sees the same nothing in every case. So the message
 * reports what it can prove and names the command that resolves it.
 */
function missingEndpoint(path: string): unknown {
	const call = async () => ({
		data: null,
		status: 0,
		headers: new Headers(),
		error: new WP_Error({
			code: "rest_no_route",
			message: `No endpoint at "${path}" in this project's generated client, so nothing was sent. Run \`kizlo generate\` against the WordPress you are connecting to.`,
		}),
	})

	return new Proxy(call, {
		get(target, key) {
			if (isInertKey(key)) return Reflect.get(target, key)
			return missingEndpoint(`${path}.${String(key)}`)
		},
		// The tree is what says an endpoint exists, and this node is what says it does not.
		has: () => false,
	})
}

/**
 * Resolves lazily rather than walking the tree up front: a serverless invocation reloads the module
 * and touches one or two endpoints, so binding all of them on every cold start is work thrown away.
 * Each node memoizes what it hands back, so repeated access costs one map lookup.
 *
 * `path` is the dotted route to this node, empty at the root, carried so a key that resolves to
 * nothing can name where it was reached from.
 */
function proxyNode(node: object, transport: WordPressTransport, path: string): unknown {
	const cache = new Map<PropertyKey, unknown>()
	const root = path === ""

	return new Proxy(node, {
		get(target, key, receiver) {
			if (cache.has(key)) return cache.get(key)

			const value = Reflect.get(target, key, receiver)
			const dotted = root ? String(key) : `${path}.${String(key)}`
			let resolved: unknown
			if (value !== null && typeof value === "object") {
				resolved = isEndpoint(value) ? createCaller(value, transport) : proxyNode(value, transport, dotted)
			} else if (value === undefined && !isInertKey(key)) {
				// Endpoints shadow the transport, so this only runs for a key the generated tree lacks:
				// `get`, `post`, `resolveList` and the rest stay reachable on the client an integration holds.
				const member = root ? transportMember(transport, key) : undefined
				resolved = member ?? missingEndpoint(dotted)
			} else resolved = value

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
	return proxyNode(endpoints, transport, "") as WP_Client<TEndpoints> & WordPressTransport
}
