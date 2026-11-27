/**
 * Minimal shape of the context a TanStack Start server-route handler receives — just the standard web
 * `Request`. Typed structurally so the package never has to depend on `@tanstack/react-router` (which
 * stays an optional peer).
 */
export interface ServerRouteContext {
	request: Request
}

/** A TanStack Start server-route handler (`server: { handlers: { GET } }`): takes the context, returns a `Response`. */
export type ServerRoute = (context: ServerRouteContext) => Promise<Response> | Response
