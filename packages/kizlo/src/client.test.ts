import { beforeAll, expect, test } from "vitest"
import { getKizloClientTestInstance, getKizloTestInstance, type KizloClientTestInstance } from "./test"

let instance: KizloClientTestInstance

beforeAll(async () => {
	const kizlo = getKizloTestInstance()
	instance = await getKizloClientTestInstance(kizlo)
})

test("api-scoped procedure routes via OpenAPI link end-to-end", async () => {
	const result = await instance.client.posts.list({ query: {} })
	expect(result.success).toBe(true)
	if (!result.success) throw new Error("unreachable")
	expect(Array.isArray(result.data.items)).toBe(true)
	expect(result.data.items.length).toBeGreaterThanOrEqual(2)
})

test("server-side error response surfaces in the envelope with the typed Kizlo code", async () => {
	const result = await instance.client.posts.get({ params: { identifier: "999999" } })
	expect(result.success).toBe(false)
	if (result.success) throw new Error("unreachable")
	expect(result.error.status).toBe(404)
	const body = (result.error as unknown as { data?: { body?: { code?: string } } }).data?.body
	expect(body?.code).toBe("POST_NOT_FOUND")
})

test("internal-scoped procedure is rejected client-side before any network call", async () => {
	const seo = (
		instance.client as unknown as {
			seo: { sitemaps: { index: () => Promise<{ success: boolean; error?: { message: string } }> } }
		}
	).seo
	const result = await seo.sitemaps.index()
	expect(result.success).toBe(false)
	expect(result.error?.message).toMatch(/internal procedure/i)
})
