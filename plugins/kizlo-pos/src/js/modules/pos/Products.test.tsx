// @vitest-environment jsdom

import { focusManager, notifyManager } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import App from "./App"
import { checkoutConfig, quoteSale, scanCart } from "./checkout-api"
import { getProduct, getProducts, getVariations, type Product, type ProductCard } from "./products-api"
import { securityRequest } from "./security-api"
import * as sharing from "./share"
import { checkout, data } from "./test-data"

vi.mock("./products-api", async (original) => ({
	...(await original<typeof import("./products-api")>()),
	getProducts: vi.fn(),
	getProduct: vi.fn(),
	getVariations: vi.fn(),
}))

vi.mock("./security-api", async (original) => ({ ...(await original<typeof import("./security-api")>()), securityRequest: vi.fn() }))

const decoder = vi.hoisted(() => ({ decodeFromConstraints: vi.fn() }))
vi.mock("./barcode-decoder", () => ({ createBarcodeReader: () => decoder }))
vi.mock("./checkout-api", async (original) => ({
	...(await original<typeof import("./checkout-api")>()),
	scanCart: vi.fn(),
	quoteSale: vi.fn(),
	checkoutConfig: vi.fn(),
}))

const card: ProductCard = { id: 1, name: "Canvas shoe", type: "simple", price: "$20.00", stock: "instock", stock_quantity: 12, image: null }
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
	vi.mocked(checkoutConfig).mockResolvedValue(checkout)
	vi.mocked(securityRequest).mockResolvedValue({
		configured: true,
		locked: false,
		idle_minutes: 15,
		has_passkey: false,
		passkey_available: false,
	})
	vi.mocked(quoteSale).mockResolvedValue({
		items: [],
		total: "2000",
		subtotal: "2000",
		discount: "0",
		tax: "0",
		shipping_total: "0",
		currency: "USD",
		decimals: 2,
		fingerprint: "preview",
		sources: { billing: "store", shipping: "store" },
		rates: [],
		chosen_rates: [],
		cash: true,
		online: [],
	})
	vi.mocked(getProducts).mockResolvedValue(page([card]))
	vi.mocked(getProduct).mockResolvedValue(detail)
	vi.mocked(getVariations).mockResolvedValue(page([]))
	decoder.decodeFromConstraints.mockResolvedValue({ stop: vi.fn() })
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

async function mount(route = "/sell", security = data.security) {
	await act(async () =>
		root.render(
			<MemoryRouter initialEntries={[route]}>
				<App data={{ ...data, security }} />
			</MemoryRouter>,
		),
	)
	await tick()
}
async function shareCard() {
	if (host.querySelector(".pos-sell")?.getAttribute("data-view") !== "products") await click("Products")
	const button = host.querySelector<HTMLButtonElement>('[aria-label="View Canvas shoe"]')
	expect(button).not.toBeNull()
	await act(async () => button?.click())
}
async function mountShare(variation = 0) {
	if (variation) vi.mocked(getProducts).mockResolvedValue(page([{ ...card, type: "variable", matched_variations: [variation] }]))
	await mount()
	await shareCard()
}
async function tick(ms = 350) {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(ms)
	})
}
async function click(text: string) {
	const element = [...host.querySelectorAll<HTMLElement>('button, a, [role="menuitem"]')].find((node) => node.textContent?.includes(text))
	expect(element, text).toBeTruthy()
	await act(async () => element?.click())
}
async function openUserMenu() {
	await act(async () =>
		host
			.querySelector(".pos-staff-account")
			?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })),
	)
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
	it.each(["/sell", "/products"])("requires PIN setup before opening %s, then permits the sales workspace", async (route) => {
		await mount(route, { configured: false, locked: true, idle_minutes: 15, has_passkey: false, passkey_available: false })
		expect(host.querySelector(".pos-user-settings")).not.toBeNull()
		expect(host.querySelector(".pos-catalog, .pos-sidebar, .pos-sale-cart, .pos-lock-screen")).toBeNull()
		expect(getProducts).not.toHaveBeenCalled()
		for (const [selector, value] of [
			["#pos-new-pin", "012345"],
			["#pos-confirm-pin", "012345"],
			["#pos-security-proof", "wordpress-password"],
		] as const) {
			await act(async () => {
				const input = host.querySelector<HTMLInputElement>(selector)
				Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value)
				input?.dispatchEvent(new Event("input", { bubbles: true }))
			})
		}
		await act(async () => host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })))
		await tick()
		expect(securityRequest).toHaveBeenCalledWith("/settings", {
			new_pin: "012345",
			confirm_pin: "012345",
			password: "wordpress-password",
			idle_minutes: 15,
		})
		expect(host.querySelector(".pos-catalog")).not.toBeNull()
		expect(getProducts).toHaveBeenCalledOnce()
	})
	it.each(["/sell", "/products"])("switches between compact cards and rows on %s without refetching", async (route) => {
		vi.mocked(getProducts).mockResolvedValue(
			page([
				{
					...card,
					image: { url: "https://cdn.example/shoe.jpg", alt: "Canvas shoe photo" },
					regular_price: "$25.00",
					attributes: [{ name: "Size", options: ["Small", "Large"] }],
				},
			]),
		)
		await mount(route)
		const product = host.querySelector(".pos-product-card")
		expect(product?.querySelector("img")?.getAttribute("src")).toBe("https://cdn.example/shoe.jpg")
		expect(product?.querySelector("h3")?.textContent).toBe(card.name)
		expect(product?.querySelector(".pos-product-price")?.textContent).toBe(card.price)
		expect(product?.querySelector(".pos-product-stock")?.textContent).toBe("Stock: 12")
		expect(product?.textContent).not.toMatch(/On sale|Small|Large|\$25/)
		expect(product?.querySelector(".pos-product-share, .pos-add-icon, .pos-product-attribute")).toBeNull()
		const toggle = host.querySelector<HTMLButtonElement>('[aria-label="Switch to list view"]')
		expect(host.querySelector(".pos-search")?.nextElementSibling).toBe(toggle)
		expect(host.querySelector(".pos-product-grid")?.getAttribute("data-layout")).toBe("cards")
		await act(async () => toggle?.click())
		expect(host.querySelector(".pos-product-grid")?.getAttribute("data-layout")).toBe("list")
		expect(host.querySelector(".pos-product-card")).toBe(product)
		await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Switch to card view"]')?.click())
		expect(host.querySelector(".pos-product-grid")?.getAttribute("data-layout")).toBe("cards")
		expect(getProducts).toHaveBeenCalledOnce()
	})
	it("remembers the selected layout after reload and across product browsing", async () => {
		await mount()
		await act(async () => host.querySelector<HTMLButtonElement>(".pos-layout-toggle")?.click())
		expect(localStorage.getItem("kizlo-pos:product-layout")).toBe("list")
		await click("Products")
		expect(host.querySelector(".pos-product-grid")?.getAttribute("data-layout")).toBe("list")
		await act(async () => root.unmount())
		root = createRoot(host)
		await mount()
		expect(host.querySelector(".pos-product-grid")?.getAttribute("data-layout")).toBe("list")
	})
	it("switches layouts when browser storage is blocked", async () => {
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("Blocked")
		})
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("Blocked")
		})
		await mount()
		await act(async () => host.querySelector<HTMLButtonElement>(".pos-layout-toggle")?.click())
		expect(host.querySelector(".pos-product-grid")?.getAttribute("data-layout")).toBe("list")
	})
	it.each(["cards", "list"])("shows stock quantities and hides untracked stock in %s view", async (layout) => {
		localStorage.setItem("kizlo-pos:product-layout", layout)
		vi.mocked(getProducts).mockResolvedValue(
			page([
				card,
				{ ...card, id: 2, name: "Unavailable shoe", stock: "outofstock", stock_quantity: 0 },
				{ ...card, id: 3, name: "Backorder shoe", stock: "onbackorder", stock_quantity: -2 },
				{ ...card, id: 4, name: "Variable shoe", type: "variable" },
				{ ...card, id: 5, name: "Unpriced shoe", price: null, stock_quantity: null },
			]),
		)
		await mount()
		expect([...host.querySelectorAll(".pos-product-stock")].map((node) => node.textContent)).toEqual([
			"Stock: 12",
			"Stock: 0",
			"Stock: -2",
			"Stock: 12",
		])
		expect(host.querySelector('[aria-label="Add Unpriced shoe"] .pos-product-stock')).toBeNull()
		expect(host.textContent).not.toContain("Stock not tracked")
		expect(host.querySelector<HTMLButtonElement>('[aria-label="Add Unavailable shoe"]')?.disabled).toBe(true)
		expect(host.querySelector<HTMLButtonElement>('[aria-label="Add Unpriced shoe"]')?.disabled).toBe(true)
		await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Add Canvas shoe"]')?.click())
		expect(host.querySelector(".pos-sale-line")?.textContent).toContain("Canvas shoe")
		await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Choose options for Variable shoe"]')?.click())
		expect(host.querySelector(".pos-product-dialog")).not.toBeNull()
	})
	it("browses and shares products without adding them and preserves the current sale between views", async () => {
		await mount()
		await click("Canvas shoe")
		await click("Walk-in customer")
		await act(async () => {
			const input = host.querySelector<HTMLInputElement>("#pos-customer-first_name") as HTMLInputElement
			Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "Taylor")
			input.dispatchEvent(new Event("input", { bubbles: true }))
		})
		await click("Save customer")
		await click("Products")
		expect(host.querySelector(".pos-sell")?.getAttribute("data-view")).toBe("products")
		expect(host.querySelector('[aria-label="Add Canvas shoe"]')).toBeNull()
		await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="View Canvas shoe"]')?.click())
		expect(host.querySelector(".pos-product-dialog")?.textContent).toContain("Share")
		await click("Close")
		await click("Home")
		expect(host.querySelector(".pos-sell")?.getAttribute("data-view")).toBe("sell")
		expect(host.querySelector<HTMLInputElement>('.pos-sale-cart input[type="number"]')?.value).toBe("1")
		expect(host.querySelector(".pos-customer-summary strong")?.textContent).toBe("Taylor")
		expect(host.querySelectorAll('.pos-sidebar button[aria-label="Scan barcode"]')).toHaveLength(1)
		expect(host.querySelector(".pos-mobile-scan")).toBeNull()
	})
	it("opens the mobile cart as a separate step and preserves items when returning to products", async () => {
		await mount()
		expect(host.querySelector(".pos-mobile-continue")).toBeNull()
		await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Add Canvas shoe"]')?.click())
		expect(host.querySelector(".pos-mobile-continue")?.textContent).toContain("1 item")
		await click("Continue")
		expect(host.querySelector(".pos-sell")?.getAttribute("data-mobile-cart")).toBe("true")
		expect(document.activeElement?.textContent).toBe("Cart")
		await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Back to products"]')?.click())
		expect(host.querySelector(".pos-sell")?.getAttribute("data-mobile-cart")).toBe("false")
		expect(document.activeElement).toBe(host.querySelector(".pos-mobile-continue"))
		await click("Continue")
		expect(host.querySelectorAll(".pos-sale-line")).toHaveLength(1)
		await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Increase quantity of Canvas shoe"]')?.click())
		expect(host.querySelector(".pos-mobile-continue")?.textContent).toContain("2 items")
		await click("Clear")
		expect(host.querySelector(".pos-mobile-continue")).toBeNull()
		expect(host.querySelector(".pos-sell")?.getAttribute("data-mobile-cart")).toBe("false")
		expect(document.activeElement?.id).toBe("pos-main")
		await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Add Canvas shoe"]')?.click())
		expect(host.querySelector(".pos-sell")?.getAttribute("data-mobile-cart")).toBe("false")
		await click("Continue")
		await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Remove Canvas shoe"]')?.click())
		expect(host.querySelector(".pos-mobile-continue")).toBeNull()
		expect(host.querySelector(".pos-sell")?.getAttribute("data-mobile-cart")).toBe("false")
		expect(document.activeElement?.id).toBe("pos-main")
		await act(async () => host.querySelector<HTMLButtonElement>(".pos-sidebar-scan")?.click())
		expect(host.querySelector('[role="dialog"]')?.textContent).toContain("Scan a barcode")
	})
	it("shows spinners until the initial catalog and product details arrive", async () => {
		let finishCatalog = (_value: ReturnType<typeof page>) => {}
		let finishProduct = (_value: Product) => {}
		vi.mocked(getProducts).mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finishCatalog = resolve
				}),
		)
		vi.mocked(getProduct).mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finishProduct = resolve
				}),
		)
		await mount()
		expect(host.querySelector('[role="status"][aria-label="Loading products"]')).not.toBeNull()
		expect(host.textContent).not.toContain("Loading products")
		await act(async () => finishCatalog(page([card])))
		await tick()
		expect(host.querySelector('[aria-label="Loading products"]')).toBeNull()
		await shareCard()
		expect(host.querySelector('.pos-product-dialog [role="status"][aria-label="Loading product"]')).not.toBeNull()
		expect(host.querySelector("#pos-detail-title")?.classList.contains("sr-only")).toBe(true)
		expect(host.textContent).not.toContain("Loading product")
		await act(async () => finishProduct(detail))
		await tick()
		expect(host.querySelector('[aria-label="Loading product"]')).toBeNull()
		expect(host.querySelector("#pos-detail-title")?.textContent).toBe(card.name)
	})
	it("keeps loaded pages while opening and closing sharing, and resets them on refresh", async () => {
		vi.mocked(getProducts)
			.mockResolvedValueOnce(page([card], 1, true))
			.mockResolvedValueOnce(page([{ ...card, id: 2, name: "Second shoe" }], 2))
			.mockResolvedValue(page([{ ...card, name: "Updated shoe" }]))
		await mount()
		await click("Load more")
		await shareCard()
		await tick(30 * 1000)
		await click("Close")
		expect(getProducts).toHaveBeenCalledTimes(2)
		expect(host.querySelectorAll(".pos-product-card")).toHaveLength(2)
		expect(host.textContent).toContain("Canvas shoe")
		expect(host.textContent).not.toContain("Loading products")
		await openUserMenu()
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
		await focus(true)
		await tick(60 * 1000)
		expect(getProducts).toHaveBeenCalledTimes(5)
	})
	it("retains product details during background failures, refreshes the caption on focus, and does not poll the share image", async () => {
		vi.stubGlobal("navigator", { share: vi.fn(), canShare: () => true })
		const image = { url: "https://cdn.example/main.png", alt: "" }
		vi.mocked(getProduct).mockResolvedValue({ ...detail, image })
		const prepare = vi.spyOn(sharing, "prepareImage").mockResolvedValue(new File(["main"], "main.png"))
		await mountShare()
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
		await mountShare()
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
		await mountShare()
		vi.mocked(getVariations).mockRejectedValueOnce(new Error("Variations refresh failed"))
		await focus(false)
		await focus(true)
		expect(host.textContent).toContain("Variations refresh failed")
		expect(host.textContent).toContain("Small")
		await click("Retry variations")
		expect(getVariations).toHaveBeenLastCalledWith(1, 1, expect.any(AbortSignal))
		expect(host.textContent).not.toContain("Variations refresh failed")
	})
	it("closes the sharing modal with Escape and restores focus to its product", async () => {
		await mount()
		await shareCard()
		expect(host.querySelector('[role="dialog"]')).not.toBeNull()
		await act(async () => {
			document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
		})
		await tick(0)
		expect(host.querySelector('[role="dialog"]')).toBeNull()
		expect(document.activeElement).toBe(host.querySelector(".pos-product-add"))
	})
	it("rejects a variation from a different parent and recovers to the requested product", async () => {
		vi.mocked(getProduct).mockImplementation(async (id) => (id === 1 ? detail : { ...detail, id, parent_id: 99, name: "Wrong product" }))
		await mountShare(2)
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
		await mountShare(2)
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
		await mountShare()
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
		await mountShare()
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
		await mountShare()
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
		await mountShare()
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
		await mountShare()
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
		await openUserMenu()
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
		await mountShare()
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
		await mountShare()
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
		await openUserMenu()
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
		await openUserMenu()
		await act(async () => host.querySelector<HTMLButtonElement>(".pos-theme-button")?.click())
		await tick(0)
		await click("Canvas shoe")
		expect(host.querySelector('[role="dialog"]')?.textContent).toContain("Small shoe")
		expect(host.querySelector('[role="dialog"]')?.textContent).toContain("$0.00")
		expect(host.querySelector(".kizlo-pos-app")?.getAttribute("data-theme")).toBe("dark")
		await click("Close")
		await tick(0)
		expect(host.querySelector('[role="dialog"]')).toBeNull()
		expect(host.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe("CANVAS")
		expect(document.activeElement).toBe(host.querySelector(".pos-product-add"))
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
		await mountShare(2)
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
		await mountShare(2)
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
	await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Scan barcode"]')?.click())
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
	await tick()
	expect(host.querySelector('.pos-sale-cart input[type="number"]')?.getAttribute("value")).toBe("1")
})

it("adds simple products directly from their card without opening product information", async () => {
	await mount()
	await click("Canvas shoe")
	expect(host.querySelector('[role="dialog"]')).toBeNull()
	expect(host.querySelector('.pos-sale-cart input[type="number"]')?.getAttribute("value")).toBe("1")
	expect(getProduct).not.toHaveBeenCalled()
	await click("Canvas shoe")
	expect(host.querySelector('.pos-sale-cart input[type="number"]')?.getAttribute("value")).toBe("2")
})
it("opens a centered variation chooser and adds only the selected available variation", async () => {
	vi.mocked(getProducts).mockResolvedValue(page([{ ...card, type: "variable" }]))
	vi.mocked(getProduct).mockImplementation(async (id) =>
		id === 1 ? { ...detail, type: "variable" } : { ...detail, id: 2, type: "variation", parent_id: 1, name: "Small shoe" },
	)
	vi.mocked(getVariations).mockResolvedValue(
		page([
			{ ...card, id: 2, name: "Small shoe", type: "variation" },
			{ ...card, id: 3, name: "Sold out", type: "variation", stock: "outofstock" },
		]),
	)
	await mount()
	await click("Canvas shoe")
	expect(host.querySelector('.pos-sale-cart input[type="number"]')).toBeNull()
	const add = [...host.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((b) => b.textContent === "Add to sale")
	expect(add?.disabled).toBe(true)
	expect(host.querySelector<HTMLInputElement>('input[name="variation"][value="3"]')?.disabled).toBe(true)
	await act(async () => host.querySelector<HTMLInputElement>('input[name="variation"][value="2"]')?.click())
	expect(add?.disabled).toBe(false)
	await act(async () => add?.click())
	expect(host.querySelector('[role="dialog"]')).toBeNull()
	expect(host.querySelector(".pos-sale-cart label")?.textContent).toBe("Small shoe")
	expect(host.querySelector('.pos-sale-cart input[type="number"]')?.id).toBe("pos-quantity-2")
})
it("shares through product browsing without adding an item", async () => {
	await mount()
	await shareCard()
	expect(host.querySelector('[role="dialog"]')?.textContent).toContain("Share caption")
	expect(host.querySelector('[role="dialog"]')?.textContent).not.toContain("Add to sale")
	expect(host.querySelector('.pos-sale-cart input[type="number"]')).toBeNull()
})
it("reports a full cart instead of silently dropping a product-card addition", async () => {
	localStorage.setItem(
		`kizlo-pos:cart:${data.restRoot}:${data.user.id}`,
		JSON.stringify({
			saleId: "bd21eb6c-186d-45b9-aac2-0d7b49dc8b80",
			submitted: false,
			items: Array.from({ length: 100 }, (_, i) => ({ id: i + 2, quantity: 1 })),
		}),
	)
	await mount()
	await click("Canvas shoe")
	expect(host.querySelector('.pos-catalog [role="alert"]')?.textContent).toContain("100 different items")
	expect(host.querySelectorAll(".pos-sale-line")).toHaveLength(100)
})

it("searches the full catalog and restarts paging without category or brand filters", async () => {
	const filters = { categories: [{ id: 7, name: "Clothing" }], brands: [{ id: 9, name: "Outdoor" }] }
	vi.mocked(getProducts).mockResolvedValue({ ...page([card], 1, true), filters })
	await mount()
	expect(host.querySelector('[aria-label="Product categories"]')).toBeNull()
	expect(host.querySelector('[aria-label="Filter products"]')).toBeNull()
	await click("Load more")
	expect(getProducts).toHaveBeenLastCalledWith("", 2, expect.any(AbortSignal))
	await search("canvas")
	await tick()
	expect(getProducts).toHaveBeenLastCalledWith("canvas", 1, expect.any(AbortSignal))
})

it("shows item images and prices in the order panel and supports quantity buttons and clearing", async () => {
	await mount()
	await click("Canvas shoe")
	const panel = host.querySelector(".pos-sale-cart") as HTMLElement
	expect(panel.querySelector(".pos-line-bottom strong")?.textContent).toBe(card.price)
	const button = (name: string) => panel.querySelector<HTMLButtonElement>(`button[aria-label="${name} Canvas shoe"]`) as HTMLButtonElement
	await act(async () => button("Increase quantity of").click())
	expect(panel.querySelector<HTMLInputElement>("input[type=number]")?.value).toBe("2")
	await act(async () => button("Decrease quantity of").click())
	expect(panel.querySelector<HTMLInputElement>("input[type=number]")?.value).toBe("1")
	expect(button("Decrease quantity of").disabled).toBe(true)
	await click("Clear")
	expect(panel.querySelectorAll(".pos-sale-line")).toHaveLength(0)
})

it("keeps scanning behind the header control so the catalog toolbar stays in one row", async () => {
	await mount()
	expect(host.querySelector("#pos-barcode")).toBeNull()
	expect(host.querySelector(".pos-catalog-tools .pos-theme-button")).toBeNull()
	await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Scan barcode"]')?.click())
	expect(host.querySelector(".pos-camera video")).not.toBeNull()
	expect(host.querySelector("#pos-barcode, .pos-scanner-dialog")).toBeNull()
})

it("retains the product dialog through its exit animation before releasing it and restoring focus", async () => {
	vi.stubGlobal("CSS", { escape: (value: string) => value })
	const computedStyle = window.getComputedStyle.bind(window)
	vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
		const style = computedStyle(element, pseudo)
		if (element.classList.contains("pos-product-dialog")) {
			// jsdom snapshots computed styles; browsers expose live animation names during state changes.
			Object.defineProperty(style, "animationName", {
				get: () => (element.getAttribute("data-state") === "closed" ? "dialog-exit" : "dialog-enter"),
			})
		}
		return style
	})
	await mount()
	await shareCard()
	await click("Close")
	const closing = host.querySelector('.pos-product-dialog[data-state="closed"]')
	expect(closing).not.toBeNull()
	expect(closing?.textContent).toContain("Canvas shoe")
	const animationEnd = new Event("animationend", { bubbles: true })
	Object.defineProperty(animationEnd, "animationName", { value: "dialog-exit" })
	await act(async () => closing?.dispatchEvent(animationEnd))
	await tick(0)
	expect(host.querySelector(".pos-product-dialog")).toBeNull()
	expect(document.activeElement).toBe(host.querySelector(".pos-product-add"))
})
