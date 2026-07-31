import { KizloError } from "../../shared/error"

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

/**
 * The public Kizlo API base URL, read from `process.env` as a last-resort fallback for a client built
 * without an explicit `url`. Client-side code passes `import.meta.env.VITE_KIZLO_API_URL` at the call
 * site (see the template's `client.ts`) so Vite inlines it into the browser bundle; this fallback only
 * matters when neither is supplied.
 */
export function getServerBaseUrl(): string {
	const baseUrl = process.env.VITE_KIZLO_API_URL?.trim()
	if (!baseUrl) {
		throw new KizloError("MISSING_ENV_VARIABLE", {
			message: "Please define VITE_KIZLO_API_URL in your .env file.",
		})
	}
	return baseUrl
}
