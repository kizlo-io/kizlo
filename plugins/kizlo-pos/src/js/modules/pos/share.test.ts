import { afterEach, describe, expect, it, vi } from "vitest"
import type { Product } from "./products-api"
import { copyLink, copyText, prepareImage, publicLink, shareFiles, shareProduct } from "./share"

const product: Product = {
	id: 1,
	name: "Shirt — Small",
	type: "variation",
	price: "$0.00",
	stock: "outofstock",
	sku: "small",
	description: "Not in the payload",
	image: null,
	share_text: "Shirt — Small\n$0.00\nMade from cotton",
	parent_id: 2,
	url: "https://shop.example/shirt",
}
afterEach(() => {
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
	vi.useRealTimers()
})

describe("sharing selected product content", () => {
	it("shares exactly one image with the server-rendered caption immediately, without requiring or adding a URL", async () => {
		const share = vi.fn().mockResolvedValue(undefined)
		const files = [new File(["main"], "main.png"), new File(["gallery"], "gallery.png")]
		vi.stubGlobal("navigator", { share, canShare: () => true })
		const result = shareProduct({ ...product, url: null }, files)
		expect(share).toHaveBeenCalledExactlyOnceWith({ text: product.share_text, files: [files[0]] })
		expect(await result).toBe("shared")
	})
	it("shares the caption when the image is unavailable, unsupported, or its capability check throws", async () => {
		const share = vi.fn().mockResolvedValue(undefined)
		const file = new File(["image"], "shirt.png")
		for (const canShare of [
			() => false,
			() => {
				throw new Error("Blocked")
			},
		]) {
			vi.stubGlobal("navigator", { share, canShare })
			expect(shareFiles([file])).toEqual([])
			expect(await shareProduct(product, [file])).toBe("shared")
			expect(share.mock.lastCall?.[0]).toEqual({ text: product.share_text })
		}
		await shareProduct(product, [])
		expect(share.mock.lastCall?.[0]).toEqual({ text: product.share_text })
	})
	it.each(["AbortError", "NotAllowedError"])("does not retry or copy after a native %s", async (name) => {
		const share = vi.fn().mockRejectedValue(new DOMException("Share rejected", name))
		const writeText = vi.fn()
		vi.stubGlobal("navigator", { share, clipboard: { writeText } })
		expect(await shareProduct(product, [])).toBe(name === "AbortError" ? "cancelled" : "failed")
		expect(share).toHaveBeenCalledTimes(1)
		expect(writeText).not.toHaveBeenCalled()
	})
	it("copies the caption without native sharing and offers manual recovery on clipboard failure", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined)
		vi.stubGlobal("navigator", { clipboard: { writeText } })
		expect(await shareProduct({ ...product, url: null }, [])).toBe("copied")
		expect(writeText).toHaveBeenCalledWith(product.share_text)
		writeText.mockRejectedValue(new Error("Denied"))
		expect(await copyText(product.share_text)).toBe("manual")
		vi.stubGlobal("navigator", {})
		expect(await copyText(product.share_text)).toBe("manual")
	})
	it("does not open a share sheet for an empty caption", async () => {
		const share = vi.fn()
		vi.stubGlobal("navigator", { share })
		expect(await shareProduct({ ...product, share_text: "  " }, [])).toBe("failed")
		expect(share).not.toHaveBeenCalled()
	})
	it("allows ordinary product slugs containing words like token and preview", () => {
		expect(publicLink("https://shop.example/products/token-preview")).toBe("https://shop.example/products/token-preview")
	})
	it.each([
		"javascript:alert(1)",
		"https://user:password@shop.example/p",
		"https://shop.example/wp-admin/p",
		"https://shop.example/p?_wpnonce=secret",
		"https://shop.example/?preview=true",
		null,
	])("never copies unsafe public URL %s", async (url) => {
		const writeText = vi.fn()
		vi.stubGlobal("navigator", { clipboard: { writeText } })
		expect(publicLink(url)).toBeNull()
		expect(await copyLink(url ?? "")).toBe("manual")
		expect(writeText).not.toHaveBeenCalled()
	})
})

describe("public image preparation", () => {
	it("fetches without credentials and prepares a bounded file", async () => {
		const fetch = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/png" } }))
		vi.stubGlobal("fetch", fetch)
		const file = await prepareImage("https://cdn.example/image.png", new AbortController().signal)
		expect(file?.size).toBe(3)
		expect(file?.type).toBe("image/png")
		expect(fetch.mock.calls[0]?.[1]).toMatchObject({ credentials: "omit", referrerPolicy: "no-referrer" })
		expect(fetch.mock.calls[0]?.[1]).not.toHaveProperty("headers")
	})
	it("falls back on invalid MIME, oversize body/header, HTTP failures, and CORS failure", async () => {
		const fetch = vi.fn()
		vi.stubGlobal("fetch", fetch)
		for (const response of [
			new Response("html"),
			new Response("x", { headers: { "Content-Type": "image/png", "Content-Length": "6000000" } }),
			new Response(new Uint8Array(5 * 1024 * 1024 + 1), { headers: { "Content-Type": "image/png" } }),
			new Response("x", { status: 404 }),
		]) {
			fetch.mockResolvedValueOnce(response)
			expect(await prepareImage("https://cdn.example/p.png", new AbortController().signal)).toBeNull()
		}
		fetch.mockRejectedValue(new TypeError("CORS"))
		expect(await prepareImage("https://cdn.example/p.png", new AbortController().signal)).toBeNull()
	})
	it("aborts preparation on selection change and after the timeout", async () => {
		vi.useFakeTimers()
		const fetch = vi.fn(
			(_url, { signal }: { signal: AbortSignal }) =>
				new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))),
		)
		vi.stubGlobal("fetch", fetch)
		const controller = new AbortController()
		const first = prepareImage("https://cdn.example/p.png", controller.signal)
		controller.abort()
		expect(await first).toBeNull()
		const timed = prepareImage("https://cdn.example/p.png", new AbortController().signal)
		await vi.advanceTimersByTimeAsync(10000)
		expect(await timed).toBeNull()
	})
})
