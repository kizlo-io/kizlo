import { getTestClientInstance, getTestServerInstance, readTestCredentials, type TestClientInstance } from "@kizlo/test"
import { beforeAll, expect, test } from "vitest"

let instance: TestClientInstance

beforeAll(async () => {
	const kizlo = getTestServerInstance()
	instance = await getTestClientInstance(kizlo)
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
	// The orpc-level error.code is the generic "NOT_FOUND"; the typed Kizlo
	// code is preserved in the response body.
	const body = (result.error as unknown as { data?: { body?: { code?: string } } }).data?.body
	expect(body?.code).toBe("POST_NOT_FOUND")
})

test("internal-scoped procedure is rejected client-side before any network call", async () => {
	const seo = (
		instance.client as unknown as {
			seo: { sitemaps: () => Promise<{ success: boolean; error?: { message: string } }> }
		}
	).seo
	const result = await seo.sitemaps()
	expect(result.success).toBe(false)
	expect(result.error?.message).toMatch(/internal procedure/i)
})

test("remote-scoped procedure routes via RPC link end-to-end (cf7 form submit)", async () => {
	const formId = readTestCredentials().fixtures.cf7FormId
	expect(formId).toBeGreaterThan(0)
	const contact = (
		instance.client as unknown as {
			contact: { submit: (input: unknown) => Promise<{ success: boolean; data?: unknown; error?: unknown }> }
		}
	).contact
	const result = await contact.submit({
		"your-name": "Test Sender",
		"your-email": "sender@example.com",
		"your-message": "transport smoke",
		captchaToken: "test-token-pass",
	})
	expect(result.success).toBe(true)
})
