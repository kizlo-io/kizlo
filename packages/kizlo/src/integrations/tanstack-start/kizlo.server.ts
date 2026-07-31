import { type CreateKizloOptions, Kizlo, resolveKizloConfig } from "../../kizlo"
import type { AnyExtension } from "../../shared/extension"

export type KizloServerOptions<TExts extends readonly AnyExtension[] = []> = CreateKizloOptions<TExts>

/**
 * The server-to-server Kizlo instance for a TanStack Start app. Reads env through `process.env` (the
 * Nitro/Node server runtime TanStack Start builds on), resolving the public API base URL from
 * `VITE_KIZLO_API_URL`. Used only server-side — server routes and server functions — so it never
 * reaches the browser bundle.
 */
export function createKizlo<TExts extends readonly AnyExtension[] = []>(options?: KizloServerOptions<TExts>): Kizlo<TExts> {
	return new Kizlo(resolveKizloConfig(options, { baseUrlEnvKey: "VITE_KIZLO_API_URL" }))
}
