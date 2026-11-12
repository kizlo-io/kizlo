// @vitest-environment jsdom

import { focusManager, notifyManager } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import App from "./App"
import { checkoutConfig, scanCart } from "./checkout-api"
import { getProduct, getProducts, getVariations, type Product, type ProductCard } from "./products-api"
import * as sharing from "./share"
import { data } from "./test-data"

vi.mock("./products-api", async (original) => ({
	...(await original<typeof import("./products-api")>()),
	getProducts: vi.fn(),
	getProduct: vi.fn(),
	getVariations: vi.fn(),
}))

const decoder = vi.hoisted(() => ({ decodeFromConstraints: vi.fn() }))
vi.mock("./barcode-decoder", () => ({ createBarcodeReader: () => decoder }))
vi.mock("./checkout-api", async (original) => ({
	...(await original<typeof import("./checkout-api")>()),
	scanCart: vi.fn(),
	checkoutConfig: vi.fn(),
}))

const card: ProductCard = { id: 1, name: "Canvas shoe", type: "simple", price: "$20.00", stock: "instock", image: null }
const detail: Product = {
	...card,
	description: "Everyday canvas",
	sku: "CANVAS",
	url: "https://shop.example/shoe",
	parent_id: null,
	share_text: "Canvas shoe\n$20.00\nEveryday canvas",
}
const page = (items: ProductCard[], number = 1, more = false) => ({ items, page: number, total: 26, has_more: more })
let root: Root
let host: HTMLDivElement

beforeEach(() => {
	vi.useFakeTimers()
	notifyManager.setScheduler(queueMicrotask)
	focusManager.setFocused(true)
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
	vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
	vi.mocked(checkoutConfig).mockRejectedValue(new Error("Checkout configuration is not loaded by browsing tests."))
	vi.mocked(getProducts).mockResolvedValue(page([card]))
	vi.mocked(getProduct).mockResolvedValue(detail)
	vi.mocked(getVariations).mockResolvedValue(page([]))
	window.localStorage.clear()
	host = document.createElement("div")
	document.body.append(host)
	root = createRoot(host)
})
afterEach(async () => {
	await act(async () => root.unmount())
	focusManager.setFocused(undefined)
	host.remove()
	vi.resetAllMocks()
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
	vi.useRealTimers()
	notifyManager.setScheduler((callback) => setTimeout(callback, 0))
})

async function mount(route = "/products") {
	await act(async () =>
		root.render(
			<MemoryRouter initialEntries={[route]}>
				<App data={data} />
			</MemoryRouter>,
		),
	)
	await tick()
}
async function tick(ms = 350) {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(ms)
	})
}
async function click(text: string) {
	const element = [...host.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>("button, a")].find((node) =>
		node.textContent?.includes(text),
	)
	expect(element, text).toBeTruthy()
	await act(async () => element?.click())
}
async function search(value: string) {
	const input = host.querySelector<HTMLInputElement>('input[type="search"]') as HTMLInputElement
	await act(async () => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value)
		input.dispatchEvent(new Event("input", { bubbles: true }))
	})
}

async function focus(value: boolean) {
	await act(async () => focusManager.setFocused(value))
}

describe("Products requests and navigation", () => {
	it("keeps loaded pages across navigation without a refetch and resets them on explicit refresh", async () => {
		vi.mocked(getProducts)
			.mockResolvedValueOnce(page([card], 1, true))
			.mockResolvedValueOnce(page([{ ...card, id: 2, name: "Second shoe" }], 2))
			.mockResolvedValue(page([{ ...card, name: "Updated shoe" }]))
		await mount()
		await click("Load more")
		await click("Sell")
		await tick(5 * 60 * 1000)
		await click("Products")
		expect(getProducts).toHaveBeenCalledTimes(2)
		expect(host.querySelectorAll(".pos-product-card")).toHaveLength(2)
		expect(host.textContent).toContain("Canvas shoe")
		expect(host.textContent).not.toContain("Loading products")
		await click("Refresh")
		expect(getProducts).toHaveBeenCalledTimes(3)
		expect(getProducts).toHaveBeenLastCalledWith("", 1, expect.any(AbortSignal))
		expect(host.textContent).toContain("Updated shoe")
		expect(host.textContent).not.toContain("Canvas shoe")
		expect(host.querySelectorAll(".pos-product-card")).toHaveLength(1)
	})
	it("polls only active visible queries and refreshes on focus even when data is fresh", async () => {
		await mount()
		expect(getProducts).toHaveBeenCalledTimes(1)
		await tick(60 * 1000)
		expect(getProducts).toHaveBeenCalledTimes(2)
		await focus(false)
		await tick(30 * 1000)
		expect(getProducts).toHaveBeenCalledTimes(2)
		await focus(true)
		expect(getProducts).toHaveBeenCalledTimes(3)
		await focus(false)
		await tick(2 * 60 * 1000)
		expect(getProducts).toHaveBeenCalledTimes(3)
		await click("Sell")
		await focus(true)
		await tick(60 * 1000)
		expect(getProducts).toHaveBeenCalledTimes(3)
	})
	it("retains product details during background failures, refreshes the caption on focus, and does not poll the share image", async () => {
		vi.stubGlobal("navigator", { share: vi.fn(), canShare: () => true })
		const image = { url: "https://cdn.example/main.png", alt: "" }
		vi.mocked(getProduct).mockResolvedValue({ ...detail, image })
		const prepare = vi.spyOn(sharing, "prepareImage").mockResolvedValue(new File(["main"], "main.png"))
		await mount("/products/1")
		vi.mocked(getProduct).mockRejectedValueOnce(new Error("Offline"))
		await tick(60 * 1000)
		expect(host.querySelector('[role="dialog"]')?.textContent).toContain("Canvas shoe")
		expect(host.textContent).toContain("Showing the last loaded product details")
		expect(host.textContent).not.toContain("Product unavailable")
		vi.mocked(getProduct).mockResolvedValue({ ...detail, image, share_text: "Fresh caption" })
		await focus(false)
		await focus(true)
		expect(host.textContent).toContain("Fresh caption")
		expect(host.textContent).not.toContain("Offline")
		expect(prepare).toHaveBeenCalledTimes(1)
	})
	it("retries a background catalog refresh without fetching the next page", async () => {
		vi.mocked(getProducts).mockResolvedValue(page([card], 1, true))
		await mount()
		vi.mocked(getProducts).mockRejectedValueOnce(new Error("Refresh failed"))
		await focus(false)
		await focus(true)
		expect(host.textContent).toContain("Refresh failed")
		expect(host.textContent).toContain("Canvas shoe")
		await click("Try again")
		expect(getProducts).toHaveBeenLastCalledWith("", 1, expect.any(AbortSignal))
		expect(host.textContent).not.toContain("Refresh failed")
	})
	it.each([401, 403, 404])("blocks sharing cached details after a background access failure (%s)", async (status) => {
		await mount("/products/1")
		vi.mocked(getProduct).mockRejectedValueOnce({ message: "Access denied", data: { status } })
		await focus(false)
		await focus(true)
		const dialog = host.querySelector('[role="dialog"]')
		expect(dialog?.textContent).toContain("Product unavailable")
		expect(dialog?.textContent).not.toContain("Share product")
		expect(dialog?.textContent).not.toContain(detail.share_text)
	})
	it("retries a background variations refresh without advancing its page", async () => {
		vi.mocked(getProduct).mockResolvedValue({ ...detail, type: "variable" })
		vi.mocked(getVariations).mockResolvedValue(page([{ ...card, id: 2, name: "Small" }], 1, true))
		await mount("/products/1")
		vi.mocked(getVariations).mockRejectedValueOnce(new Error("Variations refresh failed"))
		await focus(false)
		await focus(true)
		expect(host.textContent).toContain("Variations refresh failed")
		expect(host.textContent).toContain("Small")
		await click("Retry variations")
		expect(getVariations).toHaveBeenLastCalledWith(1, 1, expect.any(AbortSignal))
		expect(host.textContent).not.toContain("Variations refresh failed")
	})
	it("closes the shadcn sheet with Escape and restores focus to the opening product", async () => {
		await mount()
		await click("Canvas shoe")
		expect(host.querySelector('[role="dialog"]')).not.toBeNull()
		await act(async () => {
			document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
		})
		await tick(0)
		expect(host.querySelector('[role="dialog"]')).toBeNull()
		expect(document.activeElement).toBe(host.querySelector(".pos-product-card"))
	})
	it("rejects a variation from a different parent and recovers to the requested product", async () => {
		vi.mocked(getProduct).mockImplementation(async (id) => (id === 1 ? detail : { ...detail, id, parent_id: 99, name: "Wrong product" }))
		await mount("/products/1?variation=2")
		expect(host.querySelector('[role="dialog"]')?.textContent).toContain("Canvas shoe")
		expect(host.textContent).toContain("This variation is no longer available")
		expect(host.textContent).not.toContain("Wrong product")
	})
	it("refreshes the selected variation caption and resets its variation pages together", async () => {
		let caption = "Old caption"
		vi.mocked(getProduct).mockImplementation(async (id) =>
			id === 1 ? { ...detail, type: "variable" } : { ...detail, id, parent_id: 1, type: "variation", share_text: caption },
		)
		vi.mocked(getVariations).mockImplementation(async (_id, number) =>
			page([{ ...card, id: number + 1, name: number === 1 ? "Small" : "Large" }], number, number === 1),
		)
		await mount("/products/1?variation=2")
		await click("More variations")
		expect(host.textContent).toContain("Large")
		caption = "New caption"
		await click("Refresh details")
		expect(host.querySelector('[role="dialog"]')?.textContent).toContain("New caption")
		expect(host.textContent).not.toContain("Old caption")
		expect(host.textContent).not.toContain("Large")
		expect(getVariations).toHaveBeenLastCalledWith(1, 1, expect.any(AbortSignal))
	})
	it("prepares one image and shares the rendered caption without a public link, retaining details on cancellation", async () => {
		const share = vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError"))
		vi.stubGlobal("navigator", { share, canShare: () => true })
		const file = new File(["main"], "main.png")
		vi.mocked(getProduct).mockResolvedValue({ ...detail, url: null, image: { url: "https://cdn.example/main.png", alt: "" } })
		let finish: (file: File | null) => void = () => {}
		vi.spyOn(sharing, "prepareImage").mockImplementation(
			() =>
				new Promise((resolve) => {
					finish = resolve
				}),
		)
		await mount("/products/1")
		await click("Preparing image")
		expect(share).not.toHaveBeenCalled()
		await act(async () => finish(file))
		expect(host.textContent).toContain("Ready to share one image with the caption")
		expect(host.textContent).toContain(detail.share_text)
		expect(host.textContent).not.toContain("Share images only")
		await click("Share product")
		expect(share).toHaveBeenCalledExactlyOnceWith({ text: detail.share_text, files: [file] })
		expect(host.querySelector('[role="dialog"]')).not.toBeNull()
	})
	it("requires a new click for text-only retry and never drops the caption after an image share failure", async () => {
		const share = vi.fn().mockRejectedValueOnce(new Error("Rejected")).mockResolvedValue(undefined)
		vi.stubGlobal("navigator", { share, canShare: () => true })
		const file = new File(["main"], "main.png")
		vi.mocked(getProduct).mockResolvedValue({ ...detail, image: { url: "https://cdn.example/main.png", alt: "" } })
		vi.spyOn(sharing, "prepareImage").mockResolvedValue(file)
		await mount("/products/1")
		await click("Share product")
		expect(share).toHaveBeenCalledExactlyOnceWith({ text: detail.share_text, files: [file] })
		expect(host.textContent).toContain("Sharing failed")
		await click("Share text only")
		expect(share).toHaveBeenCalledTimes(2)
		expect(share).toHaveBeenLastCalledWith({ text: detail.share_text })
	})
	it("offers selectable caption text when clipboard access is denied, without a website link", async () => {
		vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("Denied")) } })
		vi.mocked(getProduct).mockResolvedValue({ ...detail, url: null })
		await mount("/products/1")
		expect([...host.querySelectorAll("button")].some((button) => button.textContent === "Copy caption")).toBe(false)
		await click("Share product")
		expect(host.querySelector<HTMLTextAreaElement>(".pos-manual-link textarea")?.value).toBe(detail.share_text)
		expect(host.textContent).toContain("Select and copy the caption")
	})
	it("ignores a delayed copy-link fallback after the selected variation changes", async () => {
		vi.mocked(getProduct).mockImplementation(async (id) =>
			id === 1
				? { ...detail, type: "variable" }
				: { ...detail, id: 2, parent_id: 1, type: "variation", url: "https://shop.example/small", share_text: "Small caption" },
		)
		vi.mocked(getVariations).mockResolvedValue(page([{ ...card, id: 2, name: "Small shoe" }]))
		let finish: (value: "manual") => void = () => {}
		vi.spyOn(sharing, "copyLink").mockImplementation(
			() =>
				new Promise((resolve) => {
					finish = resolve
				}),
		)
		await mount("/products/1")
		await click("Copy link")
		await act(async () => host.querySelector<HTMLInputElement>('input[name="variation"][value="2"]')?.click())
		await act(async () => finish("manual"))
		expect(host.textContent).toContain("Small caption")
		expect(host.querySelector(".pos-manual-link")).toBeNull()
		expect(host.textContent).not.toContain("Select and copy the link")
	})
	it("keeps WordPress sign-in and nonce reload recovery accessible inside the modal", async () => {
		vi.mocked(getProduct)
			.mockRejectedValueOnce({ data: { status: 401 } })
			.mockRejectedValueOnce({ code: "rest_cookie_invalid_nonce" })
		await mount("/products/1")
		expect(host.querySelector<HTMLAnchorElement>('[role="dialog"] .pos-error a')?.href).toBe(data.urls.login)
		await click("Try again")
		expect(host.querySelector('[role="dialog"]')?.textContent).toContain("Reload POS")
	})
	it("ignores an old next page after refresh replaces the catalog", async () => {
		let resolveOld: (value: ReturnType<typeof page>) => void = () => {}
		vi.mocked(getProducts)
			.mockResolvedValueOnce(page([card], 1, true))
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						resolveOld = resolve
					}),
			)
			.mockResolvedValueOnce(page([{ ...card, name: "Refreshed shoe" }]))
		await mount()
		await click("Load more")
		await click("Refresh")
		await tick()
		expect(vi.mocked(getProducts).mock.calls[1]?.[2].aborted).toBe(true)
		await act(async () => resolveOld(page([{ ...card, id: 2, name: "Old page" }], 2)))
		expect(host.textContent).toContain("Refreshed shoe")
		expect(host.textContent).not.toContain("Old page")
	})
	it("loads more variation choices and retains the dialog through transient selection errors", async () => {
		vi.mocked(getProduct).mockResolvedValue({ ...detail, type: "variable" })
		vi.mocked(getVariations)
			.mockResolvedValueOnce(page([{ ...card, id: 2, name: "Small" }], 1, true))
			.mockRejectedValueOnce(new Error("Offline variations"))
			.mockResolvedValueOnce(page([{ ...card, id: 3, name: "Large" }], 2))
		await mount("/products/1")
		await click("More variations")
		expect(host.textContent).toContain("Small")
		expect(host.textContent).toContain("Offline variations")
		await click("Retry variations")
		expect(host.textContent).toContain("Large")
		expect(getVariations).toHaveBeenLastCalledWith(1, 2, expect.any(AbortSignal))
	})
	it("suppresses duplicate sharing and stale image results after refreshing details", async () => {
		vi.stubGlobal("navigator", { share: vi.fn(), canShare: () => true })
		let resolveImage: (file: File | null) => void = () => {}
		vi.spyOn(sharing, "prepareImage")
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						resolveImage = resolve
					}),
			)
			.mockResolvedValue(null)
		let finishShare: (value: "cancelled") => void = () => {}
		const share = vi.spyOn(sharing, "shareProduct").mockImplementation(
			() =>
				new Promise((resolve) => {
					finishShare = resolve
				}),
		)
		vi.mocked(getProduct)
			.mockResolvedValueOnce({ ...detail, image: { url: "https://cdn.example/old.png", alt: "Old" } })
			.mockResolvedValue({ ...detail, image: { url: "https://cdn.example/new.png", alt: "New" }, share_text: "Updated caption" })
		await mount("/products/1")
		expect(host.textContent).toContain("Preparing image")
		await click("Refresh details")
		await act(async () => resolveImage(new File(["old"], "old.png")))
		await click("Share product")
		await click("Sharing…")
		expect(share).toHaveBeenCalledTimes(1)
		expect(share).toHaveBeenCalledWith(expect.objectContaining({ share_text: "Updated caption" }), [])
		await act(async () => finishShare("cancelled"))
		expect(host.querySelector('[role="dialog"]')).not.toBeNull()
		expect(host.textContent).not.toContain("Sharing failed")
	})
	it("distinguishes empty, failed, retry, and refreshed results", async () => {
		vi.mocked(getProducts)
			.mockRejectedValueOnce(new Error("Offline"))
			.mockResolvedValueOnce(page([]))
			.mockResolvedValueOnce(page([card]))
		await mount()
		expect(host.textContent).toContain("Offline")
		await click("Try again")
		await tick()
		expect(host.textContent).toContain("Your catalog is empty")
		await click("Refresh")
		await tick()
		expect(host.textContent).toContain("Canvas shoe")
	})
	it("suppresses stale responses after debounced search and handles changing back to the original query", async () => {
		let resolveOld: (value: ReturnType<typeof page>) => void = () => {}
		vi.mocked(getProducts).mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveOld = resolve
				}),
		)
		await mount()
		await search("linen")
		await tick()
		expect(vi.mocked(getProducts).mock.calls[0]?.[2].aborted).toBe(true)
		expect(getProducts).toHaveBeenLastCalledWith("linen", 1, expect.any(AbortSignal))
		await act(async () => resolveOld(page([{ ...card, name: "Stale result" }])))
		expect(host.textContent).not.toContain("Stale result")
		await search("")
		await tick()
		expect(host.textContent).toContain("Canvas shoe")
		expect(host.textContent).not.toContain("Loading products")
	})
	it("retains loaded cards on page failure, retries the same page, and deduplicates", async () => {
		vi.mocked(getProducts)
			.mockResolvedValueOnce(page([card], 1, true))
			.mockRejectedValueOnce(new Error("Page failed"))
			.mockResolvedValueOnce(page([card, { ...card, id: 2, name: "Second shoe" }], 2))
		await mount()
		await click("Load more")
		expect(host.textContent).toContain("Page failed")
		expect(host.textContent).toContain("Canvas shoe")
		await click("Try again")
		expect(getProducts).toHaveBeenLastCalledWith("", 2, expect.any(AbortSignal))
		expect(host.querySelectorAll(".pos-product-card")).toHaveLength(2)
	})
	it("opens an exact variation, preserves search/theme state, and restores focus on close", async () => {
		vi.mocked(getProducts).mockResolvedValue(page([{ ...card, type: "variable", matched_variations: [2] }]))
		vi.mocked(getProduct).mockImplementation(async (id) =>
			id === 1
				? { ...detail, type: "variable" }
				: { ...detail, id: 2, name: "Small shoe", price: "$0.00", parent_id: 1, type: "variation", stock: "outofstock" },
		)
		vi.mocked(getVariations).mockResolvedValue(page([{ ...card, id: 2, name: "Small shoe", type: "variation" }]))
		await mount()
		await search("CANVAS")
		await tick()
		await click("Canvas shoe")
		expect(host.querySelector('[role="dialog"]')?.textContent).toContain("Small shoe")
		expect(host.querySelector('[role="dialog"]')?.textContent).toContain("$0.00")
		const theme = host.querySelector<HTMLButtonElement>('[role="dialog"] .pos-theme-button')
		await act(async () => theme?.click())
		expect(host.querySelector(".kizlo-pos-app")?.getAttribute("data-theme")).toBe("dark")
		await click("Close")
		await tick(0)
		expect(host.querySelector('[role="dialog"]')).toBeNull()
		expect(host.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe("CANVAS")
		expect(document.activeElement).toBe(host.querySelector(".pos-product-card"))
	})
	it("recovers a removed variation and offers a selectable URL when clipboard is denied", async () => {
		vi.mocked(getProduct).mockImplementation(async (id) => {
			if (id === 2) throw { message: "Gone", data: { status: 404 } }
			return { ...detail, type: "variable" }
		})
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: { writeText: vi.fn().mockRejectedValue(new Error("Denied")) },
		})
		await mount("/products/1?variation=2")
		expect(host.querySelector('[role="dialog"]')?.textContent).toContain("Canvas shoe")
		expect(host.textContent).toContain("This variation is no longer available")
		await click("Copy link")
		expect(host.querySelector<HTMLTextAreaElement>(".pos-manual-link textarea")?.value).toBe(detail.url)
	})
	it("allows selecting a restored variation after a background 404", async () => {
		let available = true
		vi.mocked(getProduct).mockImplementation(async (id) => {
			if (id === 1) return { ...detail, type: "variable" }
			if (!available) throw { message: "Removed", data: { status: 404 } }
			return { ...detail, id: 2, parent_id: 1, type: "variation", name: "Small shoe", share_text: "Small caption" }
		})
		vi.mocked(getVariations).mockImplementation(async () => page(available ? [{ ...card, id: 2, name: "Small shoe" }] : []))
		await mount("/products/1?variation=2")
		expect(host.querySelector("#pos-detail-title")?.textContent).toBe("Small shoe")
		available = false
		await focus(false)
		await focus(true)
		expect(host.querySelector("#pos-detail-title")?.textContent).toBe("Canvas shoe")
		available = true
		await focus(false)
		await focus(true)
		const choice = host.querySelector<HTMLInputElement>('input[name="variation"][value="2"]')
		expect(choice).not.toBeNull()
		await act(async () => choice?.click())
		expect(host.querySelector("#pos-detail-title")?.textContent).toBe("Small shoe")
	})
})

it.each(["/products", "/sell"])("keeps camera scans on %s and adds only validated products to the current sale", async (route) => {
	vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
	let capture: (result: { getText: () => string }) => void = () => {}
	decoder.decodeFromConstraints.mockImplementation(async (_constraints, _video, callback) => {
		capture = callback
		return { stop: vi.fn() }
	})

	vi.mocked(checkoutConfig).mockResolvedValue({
		fields: { first_name: false, last_name: false, email: false, phone: false, billing: false, shipping: false },
		handoff: { device: true, send: true, default: "device" },
		store_address: { country: "US" },
		countries: {},
		states: {},
		address_fields: { billing: {}, shipping: {} },
		channels: [],
		currency: "USD",
	})
	vi.mocked(scanCart).mockResolvedValue({ id: 1, name: "Canvas shoe", quantity: 1 })
	await mount(route)
	await click("Use camera")
	await tick()
	await act(async () => capture({ getText: () => "CANVAS" }))
	expect(scanCart).toHaveBeenCalledWith("CANVAS", [])
	expect(host.querySelector(".pos-camera")?.getAttribute("data-feedback")).toBe("success")
	expect(host.querySelector(".pos-camera-feedback")?.textContent).toContain("Added Canvas shoe · quantity 1")
	expect(host.querySelector(".pos-product-sheet")).toBeNull()
	vi.mocked(scanCart).mockRejectedValue(new Error("No product matches this code."))
	await act(async () => capture({ getText: () => "MISSING" }))
	expect(scanCart).toHaveBeenLastCalledWith("MISSING", [{ id: 1, name: "Canvas shoe", quantity: 1 }])
	expect(host.querySelector(".pos-camera")?.getAttribute("data-feedback")).toBe("error")
	expect(host.querySelector(".pos-camera-feedback")?.textContent).toContain("No product matches")
	await click("Done")
	if (route === "/products") await click("Sell")
	await tick()
	expect(host.querySelector('.pos-sale-cart input[type="number"]')?.getAttribute("value")).toBe("1")
})
