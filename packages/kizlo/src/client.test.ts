import { beforeAll, expect, test } from "vitest"
import { z } from "zod"
import { RPC_PROTOCOL_HEADER } from "./shared/constants"
import { createIntegration } from "./shared/integration"
import { createProcedure } from "./shared/procedure"
import { getKizloClientTestInstance, getKizloTestInstance, type KizloClientTestInstance } from "./test/harness"

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
	expect(result.error.code).toBe("POST_NOT_FOUND")
})

test.each([
	{ code: "POST_NOT_FOUND", status: 404, message: "The post was removed.", data: null },
	{
		code: "CHECKOUT_TOTAL_MISMATCH",
		status: 409,
		message: "The order total changed.",
		data: { cart: null, expectedTotal: "1000", actualTotal: "1500" },
	},
])("preserves the API $status envelope without wrapping its data", async (body) => {
	const browser = await getKizloClientTestInstance(getKizloTestInstance(), {
		fetch: async () => Response.json(body, { status: body.status }),
	})
	const result = await browser.client.posts.get({ params: { identifier: "999999" } })
	expect(result.success).toBe(false)
	if (result.success) throw new Error("unreachable")
	expect(result.error).toMatchObject(body)
})

test.each([
	{ label: "non-Kizlo object", body: { message: "Proxy conflict" } },
	{ label: "null", body: null },
	{ label: "array", body: [] },
	{ label: "string", body: "Proxy conflict" },
	{ label: "missing code", body: { status: 409, message: "Conflict" } },
	{ label: "invalid code", body: { code: 42, status: 409, message: "Conflict" } },
	{ label: "missing status", body: { code: "CUSTOM_CONFLICT", message: "Conflict" } },
	{ label: "invalid status", body: { code: "CUSTOM_CONFLICT", status: "409", message: "Conflict" } },
	{ label: "mismatched status", body: { code: "CUSTOM_CONFLICT", status: 404, message: "Conflict" } },
	{ label: "invalid message", body: { code: "CUSTOM_CONFLICT", status: 409, message: 42 } },
])("retains the malformed-response fallback for $label", async ({ body }) => {
	const browser = await getKizloClientTestInstance(getKizloTestInstance(), {
		fetch: async () => Response.json(body, { status: 409 }),
	})
	const result = await browser.client.posts.get({ params: { identifier: "999999" } })
	expect(result.success).toBe(false)
	if (result.success) throw new Error("unreachable")
	expect(result.error).toMatchObject({ code: "CONFLICT", status: 409, data: { body } })
})

test("remote-scoped success and typed errors keep the RPC protocol", async () => {
	const integration = createIntegration({
		id: "rpc-test",
		procedures: {
			check: createProcedure(
				{
					scope: "remote",
					input: z.boolean(),
					output: z.string(),
					errors: { REMOTE_REJECTED: { status: 409, data: z.object({ reason: z.string() }) } },
				},
				({ input, errors }) => {
					if (input) throw errors.REMOTE_REJECTED({ message: "Remote rejected.", data: { reason: "review" } })
					return "accepted"
				},
			),
		},
	})
	const kizlo = getKizloTestInstance({ integrations: [integration] as const })
	const browser = await getKizloClientTestInstance(kizlo, {
		fetch: (request) => {
			expect(request.headers.get(RPC_PROTOCOL_HEADER)).toBe("1")
			return kizlo.handler(request)
		},
	})
	expect(await browser.client["rpc-test"].check(false)).toEqual({ success: true, data: "accepted", error: null })
	const rejected = await browser.client["rpc-test"].check(true)
	expect(rejected.success).toBe(false)
	if (rejected.success) throw new Error("unreachable")
	expect(rejected.error).toMatchObject({
		code: "REMOTE_REJECTED",
		status: 409,
		message: "Remote rejected.",
		data: { reason: "review" },
	})
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
