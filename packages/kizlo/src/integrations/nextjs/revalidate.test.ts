import { afterEach, expect, test, vi } from "vitest"
import { geoCloudflareNext } from "../../adapters/geo.cloudflare"
import type { ProcedureContext } from "../../context"
import { WordPressTransport } from "../../wordpress/transport"
import { nextjs } from "./integration"
import { nextRevalidation } from "./revalidate"

const { currentHeaders } = vi.hoisted(() => ({ currentHeaders: { value: new Headers() } }))
vi.mock("next/headers", () => ({ headers: () => currentHeaders.value }))
afterEach(() => {
	vi.unstubAllGlobals()
	currentHeaders.value = new Headers()
})

test("a WooCommerce settings change revalidates the whole layout", async () => {
	const revalidatePath = vi.fn()
	const revalidateTag = vi.fn()
	const [handler] = nextRevalidation({ revalidatePath, revalidateTag, sitemap: false }).events ?? []

	await handler?.handler({ type: "settings.woocommerce.updated", data: null }, {} as ProcedureContext)

	expect(revalidatePath).toHaveBeenCalledWith("/", "layout")
})

test("the revalidation handler reads the current Next.js request headers", async () => {
	const geo = geoCloudflareNext()
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
	for (const ip of ["203.0.113.1", "2001:db8::2"]) {
		currentHeaders.value = new Headers({ "cf-connecting-ip": ip })
		await event.handler({ type: "settings.site.updated", data: null }, {} as ProcedureContext)
	}
	currentHeaders.value = new Headers()
	await event.handler({ type: "settings.site.updated", data: null }, {} as ProcedureContext)
	expect(forwarded).toEqual(["203.0.113.1", "2001:db8::2", null])
	expect(revalidatePath).toHaveBeenCalledWith("/", "layout")
	expect(revalidateTag).toHaveBeenCalledWith("kizlo:robots", { expire: 0 })
})
