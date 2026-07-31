import type { ServerRoute, ServerRouteContext } from "./utils"

/** The Kizlo request handler a server entry exports (`createKizlo().handler`): a web `Request` in, `Response` out. */
export type KizloHandler = (request: Request) => Promise<Response> | Response

/** Every HTTP method TanStack Start registers per server route, each mapped to the same handler. */
export type ApiHandlers = Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD", ServerRoute>

/**
 * Fan Kizlo's single request handler out to every HTTP method, for the catch-all API route
 * (`src/routes/api/kizlo/$.ts`). TanStack Start registers one handler per method, but Kizlo's oRPC
 * handler dispatches on the request itself, so each method forwards the same raw `Request`.
 */
export function createApiHandlers(handler: KizloHandler): ApiHandlers {
	const route: ServerRoute = (context: ServerRouteContext) => handler(context.request)
	return { GET: route, POST: route, PUT: route, PATCH: route, DELETE: route, OPTIONS: route, HEAD: route }
}
