// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { HashRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import App from "./App"
import { defaultSecurity, securityRequest } from "./security-api"
import { checkout, data } from "./test-data"

vi.mock("./products-api", async (original) => ({
	...(await original<typeof import("./products-api")>()),
	getProducts: vi.fn(async () => ({ items: [], total: 0, page: 1, has_more: false })),
}))

vi.mock("./checkout-api", async (original) => ({
	...(await original<typeof import("./checkout-api")>()),
	checkoutConfig: vi.fn(async () => checkout),
}))

vi.mock("./security-api", async (original) => ({
	...(await original<typeof import("./security-api")>()),
	securityRequest: vi.fn(),
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
	document.querySelector('meta[name="theme-color"]')?.remove()
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
})

async function mount(initialData = data) {
	await act(async () =>
		root.render(
			<HashRouter>
				<App data={initialData} />
			</HashRouter>,
		),
	)
}

async function click(selector: string) {
	const target = container.querySelector<HTMLElement>(selector)
	expect(target).not.toBeNull()
	await act(async () => {
		if (target?.classList.contains("pos-staff-account"))
			target.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }))
		else target?.click()
	})
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0))
	})
}

describe("single selling screen and appearance", () => {
	it.each([false, true])("never requests or queries camera permission at app load, mobile: %s", async (mobile) => {
		vi.stubGlobal("matchMedia", () => ({ matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
		const getUserMedia = vi.fn()
		const query = vi.fn().mockResolvedValue({ state: "granted" })
		vi.stubGlobal("navigator", { mediaDevices: { getUserMedia }, permissions: { query } })
		localStorage.setItem("kizlo-pos:camera-prompt-seen", "1")
		await mount()
		expect(localStorage.getItem("kizlo-pos:camera-prompt-seen")).toBeNull()
		await click('a[href="#/products"]')
		await click('a[href="#/sell"]')
		await act(async () => root.unmount())
		root = createRoot(container)
		await mount()
		expect(getUserMedia).not.toHaveBeenCalled()
		expect(query).not.toHaveBeenCalled()
		expect(container.querySelector(".pos-camera")).toBeNull()
	})
	it("keeps the document and browser theme colors in sync with the POS", async () => {
		const meta = document.createElement("meta")
		meta.name = "theme-color"
		document.head.append(meta)
		await mount()
		expect(document.documentElement.dataset.posTheme).toBe("light")
		expect(meta.content).toBe("#f8f8f8")
		await click(".pos-staff-account")
		await click(".pos-theme-button")
		expect(document.documentElement.dataset.posTheme).toBe("dark")
		expect(meta.content).toBe("#111111")
		await click(".pos-staff-account")
		await click(".pos-theme-button")
		expect(document.documentElement.dataset.posTheme).toBe("light")
		expect(meta.content).toBe("#f8f8f8")
	})
	it.each(["unknown", "products/1", "orders", "more"])("redirects the legacy %s hash to the selling screen", async (route) => {
		window.history.replaceState(null, "", `/#/${route}`)
		await mount()
		expect(window.location.hash).toBe("#/sell")
		expect(container.querySelector('nav[aria-label="POS navigation"] a[aria-current="page"]')).not.toBeNull()
		expect(container.querySelector(".pos-catalog")).not.toBeNull()
		expect(container.querySelector(".pos-sale-cart")).not.toBeNull()
	})
	it("retains the theme on reload in the single screen", async () => {
		await mount()
		await click(".pos-staff-account")
		await click(".pos-theme-button")
		expect(container.querySelector(".kizlo-pos-app")?.getAttribute("data-theme")).toBe("dark")
		expect(window.location.hash).toBe("#/sell")
		await act(async () => root.unmount())
		root = createRoot(container)
		await mount()
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
		await click(".pos-staff-account")
		await click(".pos-theme-button")
		expect(container.querySelector(".kizlo-pos-app")?.getAttribute("data-theme")).toBe("dark")
		await click(".pos-staff-account")
		await click(".pos-theme-button")
		expect(container.querySelector(".kizlo-pos-app")?.getAttribute("data-theme")).toBe("light")
	})
	it("moves keyboard focus to content without changing the hash route", async () => {
		await mount()
		await click(".pos-skip")
		expect(document.activeElement?.id).toBe("pos-main")
		expect(window.location.hash).toBe("#/sell")
	})
})

it("dismisses the user dropdown with Escape or an outside click and restores keyboard focus", async () => {
	await mount()
	const trigger = container.querySelector<HTMLButtonElement>(".pos-staff-account") as HTMLButtonElement
	trigger.focus()
	await click(".pos-staff-account")
	const content = container.querySelector('.pos-account-actions[role="menu"]')
	expect(content).not.toBeNull()
	expect(content?.closest(".kizlo-pos-app")).not.toBeNull()
	expect(content?.querySelectorAll('[role="menuitem"]')).toHaveLength(4)
	expect(trigger.getAttribute("aria-haspopup")).toBe("menu")
	expect(trigger.getAttribute("aria-expanded")).toBe("true")
	await act(async () => {
		content?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))
		await new Promise((resolve) => setTimeout(resolve, 0))
	})
	expect(container.querySelector(".pos-account-actions")).toBeNull()
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0))
	})
	expect(document.activeElement).toBe(trigger)
	await click(".pos-staff-account")
	await act(async () => {
		const outside = container.querySelector("#pos-product-search")
		for (const type of ["pointerdown", "pointerup", "click"]) outside?.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0 }))
		await new Promise((resolve) => setTimeout(resolve, 0))
	})
	expect(container.querySelector(".pos-account-actions")).toBeNull()
	expect(trigger.getAttribute("aria-expanded")).toBe("false")
})

it("navigates user actions with arrow keys and closes after keyboard selection", async () => {
	await mount()
	await click(".pos-staff-account")
	const content = container.querySelector('.pos-account-actions[role="menu"]') as HTMLElement
	const items = [...content.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')]
	expect(document.activeElement).toBe(items[0])
	await act(async () => {
		items[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }))
		await new Promise((resolve) => setTimeout(resolve, 0))
	})
	expect(document.activeElement).toBe(items[1])
	await act(async () => {
		items[1]?.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }))
		await new Promise((resolve) => setTimeout(resolve, 0))
	})
	expect(document.activeElement).toBe(items.at(-1))
	await act(async () => {
		items.at(-1)?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }))
		await new Promise((resolve) => setTimeout(resolve, 0))
	})
	expect(container.querySelector(".kizlo-pos-app")?.getAttribute("data-theme")).toBe("dark")
	expect(container.querySelector(".pos-account-actions")).toBeNull()
})

it("opens the user settings page from the account menu with the 15-minute default", async () => {
	await mount()
	await click(".pos-staff-account")
	await click('a[href="#/settings"]')
	expect(window.location.hash).toBe("#/settings")
	expect(container.querySelector<HTMLInputElement>("#pos-idle-minutes")?.value).toBe("15")
	expect(container.querySelector("#pos-new-pin")).not.toBeNull()
	expect(container.querySelector(".pos-sidebar")).not.toBeNull()
})

it.each([true, false])("restores pointer navigation after unlocking (initial lock: %s)", async (initiallyLocked) => {
	vi.mocked(securityRequest).mockImplementation(async (action) => ({ ...(data.security ?? defaultSecurity), locked: action === "/lock" }))
	await mount({ ...data, security: { ...(data.security ?? defaultSecurity), locked: initiallyLocked } })
	if (!initiallyLocked) {
		await click(".pos-staff-account")
		const item = [...container.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((el) => el.textContent === "Lock screen")
		expect(item).toBeDefined()
		await act(async () => item?.click())
	}
	await act(async () => {
		for (const key of "012345") window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }))
	})
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0))
	})
	expect(container.querySelector(".pos-lock-screen")).toBeNull()
	expect(document.body.style.pointerEvents).not.toBe("none")
	expect(container.querySelector("#pos-main")?.hasAttribute("inert")).toBe(false)
	await click('a[href="#/products"]')
	expect(window.location.hash).toBe("#/products")
	await click(".pos-staff-account")
	await click('a[href="#/settings"]')
	expect(window.location.hash).toBe("#/settings")
	await click('a[href="#/sell"]')
	expect(window.location.hash).toBe("#/sell")
})

it.each(["light", "dark"])("keeps the %s POS theme on the lock and recovery screens", async (theme) => {
	localStorage.setItem("kizlo-pos:theme", theme)
	const meta = document.createElement("meta")
	meta.name = "theme-color"
	document.head.append(meta)
	await mount({ ...data, security: { ...(data.security ?? defaultSecurity), locked: true } })
	expect(container.querySelector(".kizlo-pos-app")?.getAttribute("data-theme")).toBe(theme)
	expect(meta.content).toBe(theme === "light" ? "#f8f8f8" : "#111111")
	const forgot = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Forgot PIN?")
	await act(async () => forgot?.click())
	expect(container.textContent).toContain("Contact your administrator to reset your POS PIN.")
	expect(container.querySelector(".pos-lock-screen")?.closest("[data-theme]")?.getAttribute("data-theme")).toBe(theme)
	expect(meta.content).toBe(theme === "light" ? "#f8f8f8" : "#111111")
	expect(window.location.hash).toBe("#/sell")
})
