import type { Promisify } from "@kizlo/shared"
import { createWordPressClient } from "./wordpress/endpoint"
import { type CartSession, WordPressTransport } from "./wordpress/transport"

export { wpEndpoint } from "./wordpress/endpoint"
export type { CartSession } from "./wordpress/transport"
export type { WP_Client, WP_Endpoint, WP_Failure, WP_Success, WP_TransportFailure } from "./wordpress/types"

export interface BrowserClientOptions<TEndpoints extends object> {
	url: string
	endpoints: TEndpoints
	getToken?: () => Promisify<string | null>
	cartSession?: CartSession
	onResponse?: (headers: Headers) => void
}

/** Bind generated WordPress endpoints directly, without an application API server. */
export function createBrowserClient<const TEndpoints extends object>(options: BrowserClientOptions<TEndpoints>) {
	if (!options.endpoints || Object.keys(options.endpoints).length === 0) {
		throw new TypeError("Generated endpoints are required. Run kizlo generate and pass the browser endpoint definitions.")
	}
	return createWordPressClient(
		new WordPressTransport({
			url: options.url,
			getToken: options.getToken,
			cartSession: options.cartSession,
			onResponse: options.onResponse,
		}),
		options.endpoints,
	)
}
