import { AsyncLocalStorage } from "node:async_hooks"
import { cloudflareConnInfo } from "../../adapters/cloudflare-connection"
import type { ConnInfo, GeoAdapter } from "../../adapters/geo"

const requests = new AsyncLocalStorage<{ connection: ConnInfo | null }>()

/** Read an explicit Cloudflare request or the active Worker entry context, without framework headers. */
export function geoCloudflare(): GeoAdapter {
	return {
		getConnInfo: (request) =>
			request ? cloudflareConnInfo(request.headers) : { ...(requests.getStore()?.connection ?? cloudflareConnInfo()) },
	}
}

/** Wrap the complete Worker fetch handler, including SSR and streamed response production. */
export function withCloudflareRequest(request: Request, handle: () => Response | Promise<Response>): Promise<Response> {
	const store: { connection: ConnInfo | null } = { connection: cloudflareConnInfo(request.headers) }
	return requests.run(store, async () => {
		try {
			const response = await handle()
			if (!response.body || response.status === 101) {
				store.connection = null
				return response
			}

			const reader = response.body.getReader()
			// A runtime can pull the response body outside the handler's async context.
			const body = new ReadableStream<Uint8Array>(
				{
					pull(controller) {
						return requests.run(store, async () => {
							try {
								const { value, done } = await reader.read()
								if (done) {
									store.connection = null
									reader.releaseLock()
									controller.close()
								} else controller.enqueue(value)
							} catch (error) {
								store.connection = null
								reader.releaseLock()
								controller.error(error)
							}
						})
					},
					cancel(reason) {
						return requests.run(store, async () => {
							try {
								await reader.cancel(reason)
							} finally {
								store.connection = null
								reader.releaseLock()
							}
						})
					},
				},
				{ highWaterMark: 0 },
			)
			return new Response(body, response)
		} catch (error) {
			store.connection = null
			throw error
		}
	})
}
