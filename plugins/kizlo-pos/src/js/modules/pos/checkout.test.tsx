// @vitest-environment jsdom
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { type CheckoutConfig, checkoutConfig, commitSale, type Quote, quoteSale, scanCart } from "./checkout-api"
import { getProducts } from "./products-api"
import { ScanInput } from "./ScanInput"
import { Sell } from "./Sell"
import { addCartItem, restoreCart, SaleCartProvider, useSaleCart } from "./sale-cart"

vi.mock("./checkout-api", async (original) => ({
	...(await original<typeof import("./checkout-api")>()),
	checkoutConfig: vi.fn(),
	quoteSale: vi.fn(),
	commitSale: vi.fn(),
	saleStatus: vi.fn(),
	lookupBarcode: vi.fn(),
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
	document.body.append(host)
	root = createRoot(host)
	vi.mocked(checkoutConfig).mockResolvedValue(config)
	vi.mocked(getProducts).mockResolvedValue({ items: [], page: 1, has_more: false, total: 0 })
	vi.mocked(quoteSale).mockResolvedValue(quote)
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
	await button("Review sale")
	expect(host.textContent).toContain("$10.00")
	await button("Confirm cash collected")
	expect(commitSale).toHaveBeenCalledWith(expect.objectContaining({ sale_id: uuid, method: "cash", fingerprint: "review" }))
	expect(host.textContent).toContain("Do not collect payment again")
	expect(JSON.parse(localStorage.getItem("test-cart") ?? "{}")).toEqual(expect.objectContaining({ saleId: uuid, submitted: true }))
	expect(JSON.parse(localStorage.getItem("test-cart") ?? "{}")).not.toHaveProperty("contact")
})
it("does not call commit when prices or fields changed since review", async () => {
	await mount()
	await button("Review sale")
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
	expect(host.querySelector('input[type="email"]')?.hasAttribute("required")).toBe(true)
	expect(host.querySelector('input[type="tel"]')).toBeNull()
})
it("completes a keyboard scan on Enter, retains leading zeroes and leaves other inputs alone", async () => {
	const scan = vi.fn(async () => {})
	await act(async () =>
		root.render(
			<div>
				<input id="customer-name" />
				<ScanInput onScan={scan} />
			</div>,
		),
	)
	const input = host.querySelector<HTMLInputElement>("#pos-barcode") as HTMLInputElement
	await act(async () => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "0012345678905")
		input.dispatchEvent(new Event("input", { bubbles: true }))
	})
	expect(scan).not.toHaveBeenCalled()
	await act(async () => host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })))
	expect(scan).toHaveBeenCalledWith("0012345678905")
	expect(input.value).toBe("")
	const customer = host.querySelector<HTMLInputElement>("#customer-name") as HTMLInputElement
	customer.focus()
	await act(async () => customer.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })))
	expect(scan).toHaveBeenCalledTimes(1)
	expect(document.activeElement).toBe(customer)
})

it("does not steal a customer field's focus when an earlier scan resolves", async () => {
	let resolve: () => void = () => {}
	const scan = vi.fn(
		() =>
			new Promise<void>((done) => {
				resolve = done
			}),
	)
	await act(async () =>
		root.render(
			<div>
				<input id="customer-name" />
				<ScanInput onScan={scan} />
			</div>,
		),
	)
	const input = host.querySelector<HTMLInputElement>("#pos-barcode") as HTMLInputElement
	await act(async () => {
		input.focus()
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "00123")
		input.dispatchEvent(new Event("input", { bubbles: true }))
	})
	await act(async () => host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })))
	const customer = host.querySelector<HTMLInputElement>("#customer-name") as HTMLInputElement
	customer.focus()
	await act(async () => resolve())
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
