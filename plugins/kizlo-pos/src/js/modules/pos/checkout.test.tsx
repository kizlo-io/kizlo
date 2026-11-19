// @vitest-environment jsdom
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { type CheckoutConfig, checkoutConfig, commitSale, type Quote, quoteSale, scanCart } from "./checkout-api"
import { getProduct, getProducts } from "./products-api"
import { Sell } from "./Sell"
import { addCartItem, restoreCart, SaleCartProvider, useSaleCart } from "./sale-cart"

vi.mock("./checkout-api", async (original) => ({
	...(await original<typeof import("./checkout-api")>()),
	checkoutConfig: vi.fn(),
	quoteSale: vi.fn(),
	commitSale: vi.fn(),
	saleStatus: vi.fn(),
	scanCart: vi.fn(),
}))
vi.mock("./products-api", async (original) => ({
	...(await original<typeof import("./products-api")>()),
	getProducts: vi.fn(),
	getProduct: vi.fn(),
}))
const uuid = "bd21eb6c-186d-45b9-aac2-0d7b49dc8b80"
const config: CheckoutConfig = {
	fields: { first_name: false, last_name: false, email: false, phone: false, billing: false, shipping: false },
	handoff: { device: true, send: true, default: "device" },
	store_address: { country: "US" },
	countries: { US: "United States" },
	states: { US: { CA: "California" } },
	address_fields: { billing: {}, shipping: {} },
	channels: [{ id: "email", label: "Email" }],
	currency: "USD",
}
const quote: Quote = {
	items: [{ id: 1, name: "Shoe", quantity: 1, total: "1000" }],
	total: "1000",
	tax: "0",
	shipping_total: "0",
	currency: "USD",
	decimals: 2,
	fingerprint: "review",
	sources: { billing: "store", shipping: "store" },
	rates: [],
	chosen_rates: [],
	cash: true,
	online: ["fixture"],
}
let root: Root
let host: HTMLDivElement
beforeEach(() => {
	vi.useFakeTimers()
	notifyManager.setScheduler(queueMicrotask)
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
	vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
	localStorage.clear()
	host = document.createElement("div")
	host.className = "kizlo-pos-app"
	document.body.append(host)
	root = createRoot(host)
	vi.mocked(checkoutConfig).mockResolvedValue(config)
	vi.mocked(getProducts).mockResolvedValue({ items: [], page: 1, has_more: false, total: 0 })
	vi.mocked(getProduct).mockResolvedValue({
		id: 1,
		name: "Shoe",
		type: "simple",
		price: "$10.00",
		stock: "instock",
		stock_quantity: null,
		image: null,
		description: "",
		sku: "",
		url: null,
		parent_id: null,
		share_text: "",
	})
	vi.mocked(quoteSale).mockImplementation(async (input) => ({
		...quote,
		subtotal: String(input.items.reduce((sum, item) => sum + item.quantity * 1000, 0)),
		total: String(input.items.reduce((sum, item) => sum + item.quantity * 1000, 0)),
		discount: "0",
	}))
})
afterEach(async () => {
	await act(async () => root.unmount())
	host.remove()
	vi.resetAllMocks()
	vi.unstubAllGlobals()
	vi.useRealTimers()
	notifyManager.setScheduler((callback) => setTimeout(callback, 0))
})
async function tick() {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(10)
	})
}
async function mount() {
	localStorage.setItem("test-cart", JSON.stringify({ items: [{ id: 1, quantity: 1 }], saleId: uuid, submitted: false }))
	await act(async () =>
		root.render(
			<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
				<SaleCartProvider storageKey="test-cart">
					<MemoryRouter initialEntries={["/sell"]}>
						<Sell theme="light" onToggleTheme={() => {}} loginUrl="https://store.test/login" />
					</MemoryRouter>
				</SaleCartProvider>
			</QueryClientProvider>,
		),
	)
	await tick()
}
async function button(label: string) {
	const node = [...host.querySelectorAll("button")].find((node) => node.textContent?.includes(label))
	expect(node).toBeTruthy()
	await act(async () => node?.click())
	await tick()
}
it("shows a spinner while checkout settings load", async () => {
	let finish = (_value: CheckoutConfig) => {}
	vi.mocked(checkoutConfig).mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				finish = resolve
			}),
	)
	await mount()
	expect(host.querySelector('[role="status"][aria-label="Loading checkout"]')).not.toBeNull()
	expect(host.textContent).not.toContain("Loading checkout")
	await act(async () => finish(config))
	await tick()
	expect(host.querySelector('[aria-label="Loading checkout"]')).toBeNull()
})
it("restores only bounded identifiers/quantities and does not restore customer data or product labels", () => {
	const value = restoreCart(
		JSON.stringify({
			saleId: uuid,
			items: [{ id: 1, quantity: 2, name: "Injected", email: "private@example.com" }],
			contact: { email: "private@example.com" },
		}),
	)
	expect(value).toEqual({ saleId: uuid, submitted: false, items: [{ id: 1, quantity: 2, name: "Item #1" }] })
	expect(restoreCart(JSON.stringify({ saleId: uuid, items: [{ id: 1, quantity: -1 }] }))).toBeNull()
	expect(addCartItem([{ id: 1, quantity: 1, name: "Shoe" }], { id: 1, name: "Shoe" })[0]?.quantity).toBe(2)
})
it("uses a reviewed server quote and preserves the sale identity after an uncertain submission", async () => {
	vi.mocked(commitSale).mockRejectedValue(new Error("Connection lost"))
	await mount()
	await button("Proceed to Payment")
	expect(host.textContent).toContain("$10.00")
	await button("Confirm cash collected")
	expect(commitSale).toHaveBeenCalledWith(expect.objectContaining({ sale_id: uuid, method: "cash", fingerprint: "review" }))
	expect(host.textContent).toContain("Do not collect payment again")
	expect(host.querySelector(".pos-sell")?.getAttribute("data-mobile-cart")).toBe("true")
	expect(JSON.parse(localStorage.getItem("test-cart") ?? "{}")).toEqual(expect.objectContaining({ saleId: uuid, submitted: true }))
	expect(JSON.parse(localStorage.getItem("test-cart") ?? "{}")).not.toHaveProperty("contact")
})
it("does not call commit when prices or fields changed since review", async () => {
	await mount()
	await button("Proceed to Payment")
	await button("Close")
	const quantity = host.querySelector<HTMLInputElement>('input[type="number"]') as HTMLInputElement
	await act(async () => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(quantity, "2")
		quantity.dispatchEvent(new Event("input", { bubbles: true }))
	})
	expect(host.textContent).not.toContain("Confirm cash collected")
	expect(commitSale).not.toHaveBeenCalled()
})
it("only displays configured contact fields and requires them", async () => {
	vi.mocked(checkoutConfig).mockResolvedValue({ ...config, fields: { ...config.fields, email: true } })
	await mount()
	expect(host.querySelector('input[type="email"]')).toBeNull()
	await button("Proceed to Payment")
	expect(host.querySelector('input[type="email"]')?.hasAttribute("required")).toBe(true)
	expect(host.querySelector('input[type="tel"]')).toBeNull()
})
it("searches a keyboard scanner barcode on Enter, retaining zeroes and leaving customer fields alone", async () => {
	await mount()
	const input = host.querySelector<HTMLInputElement>("#pos-product-search") as HTMLInputElement
	await act(async () => {
		input.focus()
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "0012345678905")
		input.dispatchEvent(new Event("input", { bubbles: true }))
	})
	await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })))
	expect(getProducts).toHaveBeenLastCalledWith("0012345678905", 1, expect.any(AbortSignal))
	expect(input.value).toBe("0012345678905")
	expect(host.querySelector("#pos-barcode")).toBeNull()
	await button("Walk-in customer")
	const customer = host.querySelector<HTMLInputElement>("#pos-customer-first_name") as HTMLInputElement
	customer.focus()
	const calls = vi.mocked(getProducts).mock.calls.length
	await act(async () => customer.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })))
	expect(getProducts).toHaveBeenCalledTimes(calls)
	expect(document.activeElement).toBe(customer)
})

it("does not steal customer focus when an earlier barcode search resolves", async () => {
	await mount()
	let finish: (page: Awaited<ReturnType<typeof getProducts>>) => void = () => {}
	vi.mocked(getProducts).mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				finish = resolve
			}),
	)
	const input = host.querySelector<HTMLInputElement>("#pos-product-search") as HTMLInputElement
	await act(async () => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "00123")
		input.dispatchEvent(new Event("input", { bubbles: true }))
	})
	await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })))
	await button("Walk-in customer")
	const customer = host.querySelector<HTMLInputElement>("#pos-customer-first_name") as HTMLInputElement
	customer.focus()
	await act(async () => finish({ items: [], page: 1, has_more: false, total: 0 }))
	await tick()
	expect(document.activeElement).toBe(customer)
})

it("rejects a late scan response if the current sale changes instead of overwriting the cart", async () => {
	let cart: ReturnType<typeof useSaleCart> | undefined
	function Harness() {
		cart = useSaleCart()
		return null
	}
	let finish: (item: { id: number; name: string; quantity: number }) => void = () => {}
	vi.mocked(scanCart).mockReturnValue(
		new Promise((resolve) => {
			finish = resolve
		}),
	)
	await act(async () =>
		root.render(
			<SaleCartProvider storageKey="test-cart">
				<Harness />
			</SaleCartProvider>,
		),
	)
	const result = cart?.addScanned("CANVAS").catch((error) => error.message)
	await act(async () => cart?.add({ id: 2, name: "Another item" }))
	await act(async () => finish({ id: 1, name: "Shoe", quantity: 1 }))
	expect(await result).toContain("sale changed")
	expect(cart?.draft.items).toEqual([{ id: 2, name: "Another item", quantity: 1 }])
	expect(() => addCartItem([{ id: 1, name: "Shoe", quantity: 10000 }], { id: 1, name: "Shoe" })).toThrow("quantity limit")
})

it("ignores a pending checkout review after the cart changes and reviews the updated quantities", async () => {
	let finish: (value: Quote) => void = () => {}
	vi.mocked(quoteSale).mockReturnValueOnce(
		new Promise((resolve) => {
			finish = resolve
		}),
	)
	await mount()
	await button("Proceed to Payment")
	await button("Close")
	const quantity = host.querySelector<HTMLInputElement>('input[type="number"]') as HTMLInputElement
	await act(async () => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(quantity, "2")
		quantity.dispatchEvent(new Event("input", { bubbles: true }))
	})
	await act(async () => finish(quote))
	expect(host.querySelector(".pos-cart-footer")?.textContent).toContain("$20.00")
	expect(host.querySelector(".pos-cart-footer")?.textContent).not.toContain("$10.00")
	expect(commitSale).not.toHaveBeenCalled()
	vi.mocked(quoteSale).mockResolvedValue({ ...quote, total: "2000" })
	await button("Proceed to Payment")
	expect(quoteSale).toHaveBeenLastCalledWith(expect.objectContaining({ items: [{ id: 1, quantity: 2 }] }))
	expect(host.querySelector('[role="dialog"]')?.textContent).toContain("$20.00")
})

it("shows live server totals, applies a discount through checkout input, and removes it", async () => {
	await mount()
	expect(host.querySelector(".pos-cart-totals")?.textContent).toContain("$10.00")
	const input = host.querySelector<HTMLInputElement>("#pos-discount-code") as HTMLInputElement
	await act(async () => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "SAVE10")
		input.dispatchEvent(new Event("input", { bubbles: true }))
	})
	vi.mocked(quoteSale).mockResolvedValue({ ...quote, subtotal: "1000", total: "900", discount: "100" })
	await button("Apply")
	expect(quoteSale).toHaveBeenLastCalledWith(expect.objectContaining({ coupon: "SAVE10" }))
	expect(host.querySelector(".pos-cart-totals")?.textContent).toContain("$9.00")
	await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Remove discount code"]')?.click())
	await tick()
	expect(quoteSale).toHaveBeenLastCalledWith(expect.objectContaining({ coupon: "" }))
})

it("edits and clears the order's customer without saving contact data to the browser draft", async () => {
	await mount()
	await button("Walk-in customer")
	const firstName = host.querySelector<HTMLInputElement>("#pos-customer-first_name") as HTMLInputElement
	await act(async () => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(firstName, "Shira")
		firstName.dispatchEvent(new Event("input", { bubbles: true }))
	})
	await act(async () =>
		host.querySelector<HTMLFormElement>('[role="dialog"] form')?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
	)
	await tick()
	expect(host.querySelector(".pos-customer-summary strong")?.textContent).toBe("Shira")
	expect(localStorage.getItem("test-cart")).not.toContain("Shira")
	await button("Shira")
	const editedName = host.querySelector<HTMLInputElement>("#pos-customer-first_name") as HTMLInputElement
	await act(async () => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(editedName, "Unsaved")
		editedName.dispatchEvent(new Event("input", { bubbles: true }))
	})
	await button("Cancel")
	expect(host.querySelector('[role="dialog"]')).toBeNull()
	expect(host.querySelector(".pos-customer-summary strong")?.textContent).toBe("Shira")
	await button("Shira")
	expect(host.querySelector<HTMLInputElement>("#pos-customer-first_name")?.value).toBe("Shira")
	await button("Cancel")
	await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Remove customer"]')?.click())
	expect(host.querySelector(".pos-customer-summary strong")?.textContent).toBe("Walk-in customer")
})

it("clears the whole sale, including its customer, discount, totals, and saved draft", async () => {
	await mount()
	await button("Walk-in customer")
	const name = host.querySelector<HTMLInputElement>("#pos-customer-first_name") as HTMLInputElement
	await act(async () => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(name, "Shira")
		name.dispatchEvent(new Event("input", { bubbles: true }))
		host.querySelector<HTMLFormElement>('[role="dialog"] form')?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
	})
	const coupon = host.querySelector<HTMLInputElement>("#pos-discount-code") as HTMLInputElement
	await act(async () => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(coupon, "SAVE10")
		coupon.dispatchEvent(new Event("input", { bubbles: true }))
	})
	await button("Apply")
	expect(host.querySelector(".pos-customer-summary strong")?.textContent).toBe("Shira")
	expect(coupon.readOnly).toBe(true)
	await button("Clear")
	expect(host.querySelectorAll(".pos-sale-line")).toHaveLength(0)
	expect(host.querySelector(".pos-customer-summary strong")?.textContent).toBe("Walk-in customer")
	expect(coupon.value).toBe("")
	expect(coupon.readOnly).toBe(false)
	expect(host.querySelector(".pos-cart-total strong")?.textContent).toBe("$0.00")
	expect([...host.querySelectorAll("button")].find((node) => node.textContent === "Proceed to Payment")?.disabled).toBe(true)
	const saved = JSON.parse(localStorage.getItem("test-cart") ?? "{}")
	expect(saved.items).toEqual([])
	expect(saved.submitted).toBe(false)
	expect(saved.saleId).not.toBe(uuid)
})
