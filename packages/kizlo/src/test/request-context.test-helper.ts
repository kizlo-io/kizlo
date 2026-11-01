import { AsyncLocalStorage } from "node:async_hooks"
import type { RequestContextAdapter } from "../adapters/request-context"

/** Test an application-owned runtime adapter without making core depend on async storage. */
export function testRequestContext() {
	const storage = new AsyncLocalStorage<{ current?: { request: Request; values: object } }>()
	const adapter: Required<RequestContextAdapter> = {
		get: () => storage.getStore()?.current,
		run: (request, values, handle) => {
			const store = { current: { request, values: { ...adapter.get()?.values, ...values } } as ReturnType<typeof adapter.get> }
			return storage.run(store, async () => {
				try {
					return await handle()
				} finally {
					store.current = undefined
				}
			})
		},
	}
	return adapter
}
