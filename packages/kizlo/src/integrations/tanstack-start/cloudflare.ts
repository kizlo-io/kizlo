import { cloudflareConnInfo } from "../../adapters/cloudflare-connection"
import type { GeoAdapter } from "../../adapters/geo"
import { FRAMEWORK_INTEGRATION_ORDER } from "../../shared/constants"
import { createIntegration } from "../../shared/integration"
import { applyCloudflareHeaders, type CloudflareCacheBinding } from "./cloudflare/cache"
import { getStartRequestContext } from "./request-context"

export type { CdnHeadersOptions, CloudflareCacheBinding, CloudflareCacheResult } from "./cloudflare/cache"
export { createCdnHeaders, revalidateTag, revalidateUrl } from "./cloudflare/cache"

interface ExecutionContext {
	cache?: CloudflareCacheBinding
	waitUntil(promise: Promise<unknown>): void
}

/** Cloudflare connection metadata, using TanStack Start's existing request scope. */
export function geoCloudflare(): GeoAdapter {
	return {
		getConnInfo(request) {
			return cloudflareConnInfo((request ?? getStartRequestContext()?.request)?.headers)
		},
	}
}

/** Add Cloudflare connection metadata; caching remains an explicit response policy. */
export function cloudflare() {
	return createIntegration({ id: "cloudflare", order: FRAMEWORK_INTEGRATION_ORDER, adapters: { geo: geoCloudflare() } })
}

/** Forward native Worker values to Start, default to no caching and encode explicit cache tags. */
export function withCloudflare<Env, Context extends ExecutionContext = ExecutionContext>(handler: {
	fetch(request: Request, options: { context: { env: Env; executionCtx: Context } }): Response | Promise<Response>
}) {
	return {
		async fetch(request: Request, env: Env, executionCtx: Context): Promise<Response> {
			return applyCloudflareHeaders(request, await handler.fetch(request, { context: { env, executionCtx } }))
		},
	}
}
