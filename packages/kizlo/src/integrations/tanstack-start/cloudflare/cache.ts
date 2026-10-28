import { createHash } from "node:crypto"
import { type Duration, seconds as durationSeconds } from "@kizlo/shared"
import { getStartRequestContext } from "../request-context"
import { EDGE_HEADERS, validateTags } from "./cache-policy"

function getCacheContext() {
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
	invalidate?(options: { tags: string[] }): Promise<CloudflareCacheResult>
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
const pageTag = (url: URL, path: string) => `kizlo:p:${digest(`${url.host}\0${path}`)}`
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

/** Select the exact pathname across query variants; never revalidate another origin. */
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
	await invalidate(state.cache, pageTag(state.url, target.pathname))
}

/** Mark responses carrying this host-scoped tag stale under their stored cache policy. */
export async function revalidateTag(tag: string): Promise<void> {
	const state = getCacheContext()
	validateTags([tag])
	await invalidate(state.cache, resourceTag(state.url, tag))
}

async function invalidate(cache: CloudflareCacheBinding, tag: string): Promise<void> {
	if (typeof cache.invalidate !== "function") throw new Error("The Worker runtime does not support cache.invalidate().")
	const result = await cache.invalidate({ tags: [tag] })
	if (result?.success !== true) {
		const detail = result?.errors?.map(({ code, message }) => `${code}: ${message}`).join("; ")
		throw new Error(`Cloudflare CDN revalidation failed${detail ? `: ${detail}` : "."}`)
	}
}

/** Default to no caching and encode cache tags without changing an application's explicit policy. */
export function applyCloudflareHeaders(request: Request, response: Response): Response {
	if (response.status === 101) return response
	const url = new URL(request.url)
	const result = new Headers(response.headers)
	if (!EDGE_HEADERS.some((name) => result.has(name))) result.set("Cache-Control", "no-store")
	if (result.has("Cloudflare-CDN-Cache-Control") || result.has("Cache-Tag")) {
		const rawTags =
			result
				.get("Cache-Tag")
				?.split(",")
				.map((tag) => tag.trim()) ?? []
		const resources = [...new Set(validateTags(rawTags))]
		if (resources.length > 998) throw new RangeError("At most 998 CDN resource tags are supported per response.")
		const tags = [pageTag(url, url.pathname), ...resources.map((tag) => resourceTag(url, tag))]
		const tagHeader = tags.join(",")
		if (tagHeader.length > MAX_TAG_HEADER_BYTES) throw new RangeError("Encoded CDN tags exceed Cloudflare's 16 KB header limit.")
		result.set("Cache-Tag", tagHeader)
	}
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers: result })
}
