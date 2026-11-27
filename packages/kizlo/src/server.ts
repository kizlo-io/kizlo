import { createWordPressClient } from "./wordpress/endpoint"
import { WordPressTransport } from "./wordpress/transport"
import type { WordPressCredentials } from "./wordpress/types"

export interface ServerClientOptions<TEndpoints extends object> {
	credentials: WordPressCredentials
	endpoints: TEndpoints
}

/** Use service credentials only from a trusted server runtime. */
export function createServerClient<const TEndpoints extends object>(options: ServerClientOptions<TEndpoints>) {
	if (typeof window !== "undefined") throw new TypeError("Service credentials must only be used on the server")
	if (!options.endpoints || Object.keys(options.endpoints).length === 0)
		throw new TypeError("Generated endpoints are required. Run kizlo generate.")
	return createWordPressClient(new WordPressTransport({ credentials: options.credentials }), options.endpoints)
}

export * from "./adapters/cookies"
export * from "./adapters/geo"
export * from "./adapters/geo.cloudflare"
export * from "./adapters/geo.vercel"
export * from "./adapters/logger"
export * from "./cookie"
export * from "./email/service"
export * from "./settings/service"
export * from "./webhook/index"
export * from "./webhook/schema"
export { WordPressTransport } from "./wordpress/transport"
