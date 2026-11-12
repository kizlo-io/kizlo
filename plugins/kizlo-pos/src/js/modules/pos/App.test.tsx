import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import App, { ErrorNotice } from "./App"
import { data } from "./test-data"

vi.mock("./products-api", async (original) => ({
	...(await original<typeof import("./products-api")>()),
	getProducts: vi.fn(async () => ({ items: [], total: 0, page: 1, has_more: false })),
}))

import { readTheme, saveTheme, systemTheme } from "./theme"

afterEach(() => vi.unstubAllGlobals())

function browser(preference: string | null = null, dark = false) {
	const storage = new Map(preference === null ? [] : [["kizlo-pos:theme", preference]])
	vi.stubGlobal("window", {
		localStorage: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) },
		matchMedia: () => ({ matches: dark }),
	})
	return storage
}

describe("single selling window", () => {
	it("renders the product/cart split with an icon sidebar and no visible page heading", () => {
		browser()
		const html = renderToStaticMarkup(
			<MemoryRouter initialEntries={["/sell"]}>
				<App data={data} />
			</MemoryRouter>,
		)
		expect(html).toContain('aria-label="Product catalog"')
		expect(html).toContain('aria-label="Current sale"')
		expect(html).toContain("Point of Sale")
		expect(html).toContain('<h1 class="sr-only">Point of Sale</h1>')
		expect(html).not.toContain("pos-workspace-heading")
		expect(html).not.toContain("Experience a seamless purchasing journey")
		expect(html).toContain('aria-label="POS navigation"')
		expect(html).toContain('aria-label="Browse products"')
		expect(html).not.toContain("View product")
	})
	it("renders explicit recovery actions instead of empty results", () => {
		const reload = renderToStaticMarkup(<ErrorNotice problem={{ message: "Expired nonce", action: "reload" }} loginUrl={data.urls.login} />)
		const login = renderToStaticMarkup(<ErrorNotice problem={{ message: "Session ended", action: "login" }} loginUrl={data.urls.login} />)
		expect(reload).toContain('role="alert"')
		expect(reload).toContain("Reload POS")
		expect(login).toContain("Sign in to WordPress")
	})
})

describe("appearance preference", () => {
	it("follows system appearance without a valid choice", () => {
		browser("invalid", true)
		expect(readTheme()).toBeNull()
		expect(systemTheme()).toBe("dark")
		const html = renderToStaticMarkup(
			<MemoryRouter initialEntries={["/sell"]}>
				<App data={data} />
			</MemoryRouter>,
		)
		expect(html).toContain('data-theme="dark"')
	})
	it("restores an explicit preference over the system default", () => {
		const storage = browser("light", true)
		expect(readTheme()).toBe("light")
		saveTheme("dark")
		expect(storage.get("kizlo-pos:theme")).toBe("dark")
		expect(readTheme()).toBe("dark")
	})
	it("falls back safely when storage is unavailable", () => {
		vi.stubGlobal("window", {
			get localStorage() {
				throw new Error("Blocked")
			},
			matchMedia: () => ({ matches: false }),
		})
		expect(readTheme()).toBeNull()
		expect(() => saveTheme("dark")).not.toThrow()
		expect(
			renderToStaticMarkup(
				<MemoryRouter initialEntries={["/sell"]}>
					<App data={data} />
				</MemoryRouter>,
			),
		).toContain('aria-label="User menu for')
	})
})
