import { signWebhook } from "@kizlo/shared"
import { expect, test, vi } from "vitest"
import z from "zod/v4"
import { Kizlo } from "../../../kizlo"
import { createIntegration } from "../../../shared/integration"
import { createEventHandler } from "../../../webhook"
import { SETTINGS_EVENT_TYPES, SETTINGS_INDEXED_EVENT_TYPES } from "../../../webhook/schema"
import { createCdnHeaders, withCloudflare } from "../cloudflare"
import { type RevalidatorOptions, revalidator } from "./revalidator"

const { storage } = vi.hoisted(() => ({ storage: { current: undefined as { request: Request; values: object } | undefined } }))
vi.mock("@tanstack/start-client-core", () => ({ getGlobalStartContext: () => storage.current?.values }))
vi.mock("@tanstack/start-server-core/request-response", () => ({
	getRequest: () => {
		if (!storage.current) throw new Error("No request")
		return storage.current.request
	},
}))
const product = (id: number) => `product:${id}`
const category = (id: number) => `category:${id}`
const options: RevalidatorOptions = {
	postTypes: {
		product: { resourceTag: product, collectionTags: ({ affected_terms }) => (affected_terms.product_cat ?? []).map(category) },
		guide: { resourceTag: (id) => `guide:${id}`, collectionTags: () => ["guides"] },
	},
	taxonomies: { product_cat: { resourceTag: category } },
	settings: { "settings.taxonomy.updated": ({ data }) => [`attribute:${data.key}`] },
}
const post = (affected_terms: unknown = { product_cat: [10, 20] }) => ({
	type: "post.updated",
	data: { post_id: 1, post_type: "product", affected_terms },
})
async function send(
	event: unknown,
	config: RevalidatorOptions = options,
	extras: ReturnType<typeof createEventHandler>[] = [],
	origin = "https://shop.example",
	cache = { invalidate: vi.fn(async (_targets: { tags?: string[] }) => ({ success: true })) },
) {
	const server = new Kizlo({
		baseUrl: "https://shop.example/api",
		siteSecret: "secret",
		credentials: { url: "https://wp.example", username: "a", password: "b" },
		integrations: [revalidator(config), createIntegration({ id: "custom", events: extras })],
	})
	const payload = JSON.stringify(event)
	const timestamp = new Date()
	const request = new Request(`${origin}/api/webhooks`, {
		method: "POST",
		body: payload,
		headers: {
			"Content-Type": "application/json",
			"webhook-id": "msg_test",
			"webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
			"webhook-signature": signWebhook({ secret: "secret", messageId: "msg_test", timestamp, payload }),
		},
	})
	const worker = withCloudflare({
		fetch: async (request: Request, { context }: { context: object }) => {
			storage.current = { request, values: context }
			try {
				return await server.handler(request)
			} finally {
				storage.current = undefined
			}
		},
	})
	return { response: await worker.fetch(request, {}, { cache, waitUntil() {} }), cache }
}
async function encoded(names: string[]) {
	const worker = withCloudflare({ fetch: () => new Response(null, { headers: createCdnHeaders({ maxAge: 60, tags: names }) }) })
	return (await worker.fetch(new Request("https://shop.example/product"), {}, { waitUntil() {} })).headers.get("Cache-Tag")?.split(",")
}

test("A-to-B invalidates project resource and both collection identities using storage hashes", async () => {
	const { response, cache } = await send(post())
	expect(response.status).toBeLessThan(300)
	expect(cache.invalidate).toHaveBeenCalledExactlyOnceWith({ tags: await encoded(["product:1", "category:10", "category:20"]) })
})

test.each([null, undefined, { product_cat: [0] }, { product_cat: [Number.MAX_SAFE_INTEGER + 1] }, []])(
	"rejects incomplete matched dependencies: %j",
	async (affected) => {
		const { response, cache } = await send({ ...post(), data: { ...post().data, affected_terms: affected } })
		expect(response.status).toBe(422)
		expect(cache.invalidate).not.toHaveBeenCalled()
	},
)

test("accepts complete empty maps and ignores unconfigured legacy content", async () => {
	const empty = await send(post({}))
	expect(empty.response.status).toBeLessThan(300)
	expect(empty.cache.invalidate).toHaveBeenCalledOnce()
	const other = await send({ type: "post.updated", data: { post_id: 9, post_type: "other" } })
	expect(other.response.status).toBeLessThan(300)
	expect(other.cache.invalidate).not.toHaveBeenCalled()
})

test("term reparent/rename invalidates own identity and every captured ancestor without product enumeration", async () => {
	const { response, cache } = await send({
		type: "term.updated",
		data: { term_id: 10, taxonomy: "product_cat", post_types: ["product"], count: 5000, affected_terms: { product_cat: [10, 3, 4, 3] } },
	})
	expect(response.status).toBeLessThan(300)
	expect(cache.invalidate).toHaveBeenCalledExactlyOnceWith({ tags: await encoded(["category:10", "category:3", "category:4"]) })
})

test("custom content and indexed attribute settings use the same rules", async () => {
	const guide = await send({ type: "post.created", data: { post_id: 8, post_type: "guide", affected_terms: {} } })
	expect(guide.cache.invalidate).toHaveBeenCalledExactlyOnceWith({ tags: await encoded(["guide:8", "guides"]) })
	const setting = await send({ type: "settings.taxonomy.updated", data: { key: "pa_color" } })
	expect(setting.cache.invalidate).toHaveBeenCalledExactlyOnceWith({ tags: await encoded(["attribute:pa_color"]) })
})

test.each(SETTINGS_EVENT_TYPES)("purges the calling entrypoint for global settings: %s", async (type) => {
	const cache = {
		invalidate: vi.fn(async (_targets: { tags?: string[] }) => ({ success: true })),
		purge: vi.fn(async (_targets: { purgeEverything: true }) => ({ success: true })),
	}
	const data = SETTINGS_INDEXED_EVENT_TYPES.includes(type as never) ? { key: "product" } : null
	const { response } = await send({ type, data }, { ...options, settings: "purge" }, [], undefined, cache)
	expect(response.status).toBeLessThan(300)
	expect(cache.purge).toHaveBeenCalledExactlyOnceWith({ purgeEverything: true })
	expect(cache.invalidate).not.toHaveBeenCalled()
})

test("global settings mode retains targeted content rules and never falls back after a purge failure", async () => {
	const cache = {
		invalidate: vi.fn(async (_targets: { tags?: string[] }) => ({ success: true })),
		purge: vi.fn(async (_targets: { purgeEverything: true }) => ({ success: false })),
	}
	const config = { ...options, settings: "purge" as const }
	expect((await send(post(), config, [], undefined, cache)).response.status).toBeLessThan(300)
	expect(cache.invalidate).toHaveBeenCalledOnce()
	expect(cache.purge).not.toHaveBeenCalled()
	cache.invalidate.mockClear()
	expect((await send({ type: "settings.site.updated", data: null }, config, [], undefined, cache)).response.status).toBe(503)
	expect(cache.purge).toHaveBeenCalledOnce()
	expect(cache.invalidate).not.toHaveBeenCalled()
	cache.purge.mockClear()
	expect((await send({ type: "settings.taxonomy.updated", data: null }, config, [], undefined, cache)).response.status).toBe(422)
	expect(cache.purge).not.toHaveBeenCalled()
	const foreign = await send({ type: "settings.brand.updated", data: null }, config, [], "https://foreign.example", cache)
	expect(foreign.response.status).toBe(422)
	expect(cache.purge).not.toHaveBeenCalled()
	const unsupported = { invalidate: vi.fn(async (_targets: { tags?: string[] }) => ({ success: true })) }
	expect((await send({ type: "settings.site.updated", data: null }, config, [], undefined, unsupported)).response.status).toBe(503)
	expect(unsupported.invalidate).not.toHaveBeenCalled()
})

test("batches the complete target set and stops on first rejected batch", async () => {
	const cache = { invalidate: vi.fn(async (_targets: { tags?: string[] }) => ({ success: true })) }
	const config = {
		postTypes: { product: { resourceTag: product, collectionTags: () => Array.from({ length: 1001 }, (_, id) => `scope:${id}`) } },
	}
	const success = await send(post(), config, [], undefined, cache)
	expect(success.response.status).toBeLessThan(300)
	expect(cache.invalidate.mock.calls.map(([targets]) => targets.tags?.length)).toEqual([...Array(10).fill(100), 2])
	cache.invalidate.mockReset().mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false })
	expect((await send(post(), config, [], undefined, cache)).response.status).toBe(503)
	expect(cache.invalidate).toHaveBeenCalledTimes(2)
})

test("validates all callbacks before provider effects and rejects promises/malformed results", async () => {
	for (const collectionTags of [
		() => ["good", "bad tag"],
		() => {
			throw new Error("callback")
		},
		() => Promise.resolve(["later"]),
	]) {
		const config = { postTypes: { product: { resourceTag: product, collectionTags } } } as RevalidatorOptions
		const { response, cache } = await send(post(), config)
		expect(response.status).toBe(503)
		expect(cache.invalidate).not.toHaveBeenCalled()
	}
	expect(() => revalidator({ settings: { "wrong.event": () => [] } } as RevalidatorOptions)).toThrow()
})

test("required failures await other handlers; legacy failures remain log-only", async () => {
	const finished = vi.fn()
	const legacy = createEventHandler(async () => {
		await Promise.resolve()
		finished()
		throw new Error("legacy")
	})
	const cache = { invalidate: vi.fn(async () => ({ success: false })) }
	expect((await send(post(), options, [legacy], undefined, cache)).response.status).toBe(503)
	expect(finished).toHaveBeenCalledOnce()
	expect((await send(post(), {}, [legacy])).response.status).toBeLessThan(300)
	const custom = createEventHandler([{ types: ["post.updated"], data: z.object({ special: z.literal(true) }) }], () => {})
	expect((await send(post(), {}, [{ ...custom, failureMode: "retry" }])).response.status).toBe(422)
})

test("fails wrong-origin invalidation without provider calls and preserves rate limits", async () => {
	const foreign = await send(post(), options, [], "https://foreign.example")
	expect(foreign.response.status).toBeGreaterThanOrEqual(400)
	expect(foreign.cache.invalidate).not.toHaveBeenCalled()
	const cache = {
		invalidate: vi.fn(async () => {
			throw Object.assign(new Error("limited"), { status: 429 })
		}),
	}
	const limited = await send(post(), options, [], undefined, cache)
	expect(limited.response.status).toBe(429)
	expect(limited.response.headers.get("Retry-After")).toBe("60")
})

test.each([null, {}, { post_id: 1 }, { post_id: 1, post_type: "" }])(
	"rejects events whose missing kind prevents configured rule selection: %j",
	async (data) => {
		const result = await send({ type: "post.updated", data })
		expect(result.response.status).toBe(422)
		expect(result.cache.invalidate).not.toHaveBeenCalled()
		const term = await send({ type: "term.updated", data })
		expect(term.response.status).toBe(422)
		expect(term.cache.invalidate).not.toHaveBeenCalled()
	},
)
