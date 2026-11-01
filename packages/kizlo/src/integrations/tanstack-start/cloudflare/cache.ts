import { createHash } from "node:crypto"
import { type Duration, seconds as durationSeconds } from "@kizlo/shared"
import { getStartRequestContext } from "../request-context"
import { EDGE_HEADERS, validateTags } from "./cache-policy"

export function getCacheContext() {
	const context = getStartRequestContext()
	const values = context?.values as { executionCtx?: { cache?: CloudflareCacheBinding } } | undefined
	const cache = values?.executionCtx?.cache
	if (!context || !cache)
		throw new Error(
			"CDN revalidation requires a TanStack Start request with executionCtx.cache. Use withCloudflare at the Worker entrypoint.",
		)
	return { url: new URL(context.request.url), cache }
}

export interface CloudflareCacheResult {
	success: boolean
	errors?: { code: number; message: string }[]
}

/** Native Workers Cache control surface, not the separate caches.default API. */
export interface CloudflareCacheBinding {
	invalidate?(options: { tags?: string[]; pathPrefixes?: string[] }): Promise<CloudflareCacheResult>
	purge?(options: { purgeEverything: true }): Promise<CloudflareCacheResult>
}

export interface CdnHeadersOptions {
	/** Freshness in seconds at the edge. Browser reuse requires revalidation. */
	maxAge: Duration
	staleWhileRevalidate?: Duration
	/** Defaults to zero so a failing origin cannot keep stale pages indefinitely. */
	staleIfError?: Duration
	tags?: readonly string[]
	/** Request headers that select separate cached responses. No variance is added automatically. */
	vary?: readonly string[]
}

const MAX_TAG_HEADER_BYTES = 16_384
const digest = (value: string) => createHash("sha256").update(value).digest("hex")
const resourceTag = (url: URL, tag: string) => `kizlo:t:${digest(`${url.host}\0${tag}`)}`

function seconds(value: Duration, name: string): number {
	value = typeof value === "number" ? value : durationSeconds(value)
	if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a nonnegative integer number of seconds.`)
	return value
}

export function createCdnHeaders(options: CdnHeadersOptions): Record<string, string> {
	const directives = [`public`, `max-age=${seconds(options.maxAge, "maxAge")}`]
	if (options.staleWhileRevalidate !== undefined) {
		directives.push(`stale-while-revalidate=${seconds(options.staleWhileRevalidate, "staleWhileRevalidate")}`)
	}
	directives.push(`stale-if-error=${seconds(options.staleIfError ?? 0, "staleIfError")}`)
	const tags = validateTags(options.tags ?? []).join(",")
	const vary = options.vary ?? []
	if (!Array.isArray(vary) || vary.some((name) => typeof name !== "string" || !name.length || /[^!#$%&'*+.^_`|~0-9a-z-]/i.test(name))) {
		throw new TypeError("Vary must be an array of HTTP header names.")
	}
	const names = [...new Map(vary.map((name) => [name.toLowerCase(), name])).values()]
	return {
		"Cache-Control": "no-cache",
		"Cloudflare-CDN-Cache-Control": directives.join(", "),
		...(tags ? { "Cache-Tag": tags } : {}),
		...(names.length ? { Vary: names.includes("*") ? "*" : names.join(", ") } : {}),
	}
}

/** Mark the native pathname prefix stale, including its query variants and longer paths. */
export async function revalidateUrl(url: string | URL): Promise<void> {
	const state = getCacheContext()
	const value = url instanceof URL ? url.href : url
	if (typeof value !== "string" || !/^(?:\/(?!\/)|https?:\/\/)/i.test(value) || /[\s\p{Cc}\\]/u.test(value)) {
		throw new TypeError("CDN URLs must be absolute pathnames or same-origin HTTP(S) URLs without whitespace or backslashes.")
	}
	const target = new URL(value, state.url)
	if (target.origin !== state.url.origin || target.username || target.password) {
		throw new TypeError("CDN URLs must belong to the current origin and cannot contain credentials.")
	}
	await invalidate(state.cache, { pathPrefixes: [target.pathname] })
}

/** Mark responses carrying this host-scoped tag stale under their stored cache policy. */
export async function revalidateTag(tag: string): Promise<void> {
	await revalidateTags([tag])
}

/** Submit every dependency, independently of the response storage budget. */
export async function revalidateTags(tags: readonly string[]): Promise<void> {
	const unique = validateTags(tags)
	const state = getCacheContext()
	for (let index = 0; index < unique.length; index += 100) {
		await invalidate(state.cache, { tags: unique.slice(index, index + 100).map((tag) => resourceTag(state.url, tag)) })
	}
}

/** Remove every cached response owned by the calling Worker entrypoint. */
export async function purgeCache(): Promise<void> {
	const { cache } = getCacheContext()
	if (typeof cache.purge !== "function") throw new Error("The Worker runtime does not support cache.purge().")
	assertCacheResult(await cache.purge({ purgeEverything: true }))
}

async function invalidate(cache: CloudflareCacheBinding, targets: { tags?: string[]; pathPrefixes?: string[] }): Promise<void> {
	if (typeof cache.invalidate !== "function") throw new Error("The Worker runtime does not support cache.invalidate().")
	assertCacheResult(await cache.invalidate(targets))
}

function assertCacheResult(result: CloudflareCacheResult): void {
	if (result?.success !== true) {
		const detail = result?.errors?.map(({ code, message }) => `${code}: ${message}`).join("; ")
		throw new Error(`Cloudflare CDN revalidation failed${detail ? `: ${detail}` : "."}`)
	}
}

/** Default to no caching and encode only authored resource tags. */
export function applyCloudflareHeaders(request: Request, response: Response): Response {
	if (response.status === 101) return response
	const result = new Headers(response.headers)
	if (!EDGE_HEADERS.some((name) => result.has(name))) result.set("Cache-Control", "no-store")
	const authoredTags = result.get("Cache-Tag")
	if (authoredTags !== null) {
		const url = new URL(request.url)
		const resources = validateTags(authoredTags.split(",").map((tag) => tag.trim()))
		const encoded = resources.map((tag) => resourceTag(url, tag))
		const retained: string[] = []
		let bytes = 0
		for (const tag of encoded) {
			const next = bytes + tag.length + (retained.length ? 1 : 0)
			if (retained.length === 1000 || next > MAX_TAG_HEADER_BYTES) break
			retained.push(tag)
			bytes = next
		}
		if (retained.length < resources.length)
			console.warn({
				code: "KIZLO_CDN_TAGS_TRIMMED",
				pathname: url.pathname,
				requested: resources.length,
				retained: retained.length,
				dropped: resources.length - retained.length,
				maxBytes: MAX_TAG_HEADER_BYTES,
				maxTags: 1000,
			})
		const tagHeader = retained.join(",")
		result.set("Cache-Tag", tagHeader)
	}
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers: result })
}
