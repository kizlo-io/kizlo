// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { HashRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import App from "./App"
import { data } from "./test-data"

vi.mock("./products-api", async (original) => ({
	...(await original<typeof import("./products-api")>()),
	getProducts: vi.fn(async () => ({ items: [], total: 0, page: 1, has_more: false })),
}))

let root: Root
let container: HTMLDivElement

beforeEach(() => {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
	vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
	window.localStorage.clear()
	window.history.replaceState(null, "", "/")
	container = document.createElement("div")
	document.body.append(container)
	root = createRoot(container)
})

afterEach(async () => {
	await act(async () => root.unmount())
	container.remove()
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
})

async function mount() {
	await act(async () =>
		root.render(
			<HashRouter>
				<App data={data} />
			</HashRouter>,
		),
	)
}

async function click(selector: string) {
	const target = container.querySelector<HTMLElement>(selector)
	expect(target).not.toBeNull()
	await act(async () => {
		target?.click()
		await new Promise((resolve) => setTimeout(resolve, 0))
	})
}

describe("navigation and appearance in the mounted app", () => {
	it("opens Products and recovers unknown hash routes", async () => {
		window.history.replaceState(null, "", "/#/unknown")
		await mount()
		expect(window.location.hash).toBe("#/products")
		expect(container.querySelector("h1")?.textContent).toBe("Products")
		expect(container.querySelector(".pos-bottom-nav .is-active")?.textContent).toBe("Products")
	})
	it("keeps secondary navigation selected and the route intact when switching themes", async () => {
		await mount()
		await click('.pos-bottom-nav a[href="#/more"]')
		expect(container.querySelector("h1")?.textContent).toBe("More")
		await click('.pos-more a[href="#/orders"]')
		expect(window.location.hash).toBe("#/orders")
		expect(container.querySelector('.pos-bottom-nav [aria-current="page"]')?.textContent).toBe("More")
		await click(".pos-theme-button")
		expect(container.querySelector(".kizlo-pos-app")?.getAttribute("data-theme")).toBe("dark")
		expect(window.location.hash).toBe("#/orders")
		expect(window.localStorage.getItem("kizlo-pos:theme")).toBe("dark")
		await act(async () => root.unmount())
		root = createRoot(container)
		await mount()
		expect(container.querySelector("h1")?.textContent).toBe("Orders")
		expect(container.querySelector(".kizlo-pos-app")?.getAttribute("data-theme")).toBe("dark")
	})
	it("switches themes even when browser storage is blocked", async () => {
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("Blocked")
		})
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("Blocked")
		})
		await mount()
		await click(".pos-theme-button")
		expect(container.querySelector(".kizlo-pos-app")?.getAttribute("data-theme")).toBe("dark")
		await click(".pos-theme-button")
		expect(container.querySelector(".kizlo-pos-app")?.getAttribute("data-theme")).toBe("light")
	})
	it("moves keyboard focus to content without changing the hash route", async () => {
		await mount()
		await click(".pos-skip")
		expect(document.activeElement?.id).toBe("pos-main")
		expect(window.location.hash).toBe("#/products")
	})
})
