/** Request-local values supplied by a runtime integration, never by global core state. */
export interface RequestContextAdapter {
	get(): { request: Request; values: object } | undefined
	/** Optional when the framework already owns request scoping. */
	run?(request: Request, values: object | undefined, handle: () => Promise<Response>): Promise<Response>
}
