/**
 * Minimal shape of Astro's `APIContext` this integration needs: just the standard web `Request`.
 * Typed structurally so the package never has to depend on `astro` (which stays an optional peer).
 */
export interface AstroRouteContext {
	request: Request
}

/** An Astro endpoint handler (`export const GET = …`): takes the route context, returns a `Response`. */
export type AstroRoute = (context: AstroRouteContext) => Promise<Response> | Response
