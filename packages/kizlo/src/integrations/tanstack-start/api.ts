import type { ServerRoute, ServerRouteContext } from "./utils"

/** A standalone web Request/Response handler, such as a signed webhook receiver. */
export type KizloHandler = (request: Request) => Promise<Response> | Response

/** Every HTTP method TanStack Start registers per server route, each mapped to the same handler. */
export type ApiHandlers = Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD", ServerRoute>

/** Adapt a standalone handler to native Start server route methods. */
export function createApiHandlers(handler: KizloHandler): ApiHandlers {
	const route: ServerRoute = (context: ServerRouteContext) => handler(context.request)
	return { GET: route, POST: route, PUT: route, PATCH: route, DELETE: route, OPTIONS: route, HEAD: route }
}
