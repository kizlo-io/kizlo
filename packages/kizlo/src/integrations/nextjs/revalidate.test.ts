import { AsyncLocalStorage } from "node:async_hooks"
import { afterEach, expect, test, vi } from "vitest"
import type { ProcedureContext } from "../../context"
import { WordPressTransport } from "../../wordpress/transport"
import { geoCloudflare, withCloudflareRequest } from "../cloudflare"
import { nextjs } from "./integration"
import { nextRevalidation } from "./revalidate"

afterEach(() => vi.unstubAllGlobals())

test("a WooCommerce settings change revalidates the whole layout", async () => {
	const revalidatePath = vi.fn()
	const revalidateTag = vi.fn()
	const [handler] = nextRevalidation({ revalidatePath, revalidateTag, sitemap: false }).events ?? []

	await handler?.handler({ type: "settings.woocommerce.updated", data: null }, {} as ProcedureContext)

	expect(revalidatePath).toHaveBeenCalledWith("/", "layout")
})

test("the real revalidation handler uses its own request IP and clears it after completion", async () => {
	const geo = geoCloudflare()
	const getClientIp = async () => (await geo.getConnInfo(null)).ip
	const transport = new WordPressTransport({
		credentials: { url: "https://wp.example", username: "admin", password: "secret" },
		getClientIp,
	})
	const forwarded: (string | null)[] = []
	vi.stubGlobal(
		"fetch",
		vi.fn(async (_url: unknown, init?: RequestInit) => {
			forwarded.push(new Headers(init?.headers).get("x-real-ip"))
			return Response.json({})
		}),
	)
	const regenerate = async () => {
		await transport.get("wp-json/kizlo/v1/settings", {})
		return []
	}
	const revalidatePath = vi.fn()
	const revalidateTag = vi.fn()
	const [event] = nextjs({ env: {}, revalidate: { paths: regenerate, revalidatePath, revalidateTag } }).events ?? []
	if (!event) throw new Error("Expected Next.js revalidation to be enabled")
	let afterCompletion!: () => Promise<string | null>
	for (const ip of ["203.0.113.1", "2001:db8::2"]) {
		await withCloudflareRequest(new Request("https://app.example/webhooks", { headers: { "cf-connecting-ip": ip } }), async () => {
			await event.handler({ type: "settings.site.updated", data: null }, {} as ProcedureContext)
			afterCompletion = AsyncLocalStorage.bind(getClientIp)
			return new Response(null)
		})
		expect(await afterCompletion()).toBeNull()
	}
	await event.handler({ type: "settings.site.updated", data: null }, {} as ProcedureContext)
	expect(forwarded).toEqual(["203.0.113.1", "2001:db8::2", null])
	expect(revalidatePath).toHaveBeenCalledWith("/", "layout")
	expect(revalidateTag).toHaveBeenCalledWith("kizlo:robots", { expire: 0 })
})
