import { KizloError } from "../../shared/error"

/**
 * Minimal shape of Astro's `APIContext` this integration needs: just the standard web `Request`.
 * Typed structurally so the package never has to depend on `astro` (which stays an optional peer).
 */
export interface AstroRouteContext {
	request: Request
}

/** An Astro endpoint handler (`export const GET = …`): takes the route context, returns a `Response`. */
export type AstroRoute = (context: AstroRouteContext) => Promise<Response> | Response

/**
 * The public Kizlo API base URL, read from `process.env` as a last-resort fallback when this client
 * factory runs on the server without an explicit `url`. Browser code passes
 * `import.meta.env.PUBLIC_KIZLO_BASE_URL` at the call site so Vite can inline it.
 */
export function getServerBaseUrl(): string {
	const baseUrl = process.env.PUBLIC_KIZLO_BASE_URL?.trim()
	if (!baseUrl) {
		throw new KizloError("MISSING_ENV_VARIABLE", {
			message: "Please define PUBLIC_KIZLO_BASE_URL in your .env file.",
		})
	}
	return baseUrl
}
