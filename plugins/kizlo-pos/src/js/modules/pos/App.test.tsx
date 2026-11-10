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

describe("base navigation", () => {
	it.each(["products", "sell", "orders", "settings", "more"])("renders %s with its selected navigation and screen", (screen) => {
		browser()
		const html = renderToStaticMarkup(
			<MemoryRouter initialEntries={[`/${screen}`]}>
				<App data={data} />
			</MemoryRouter>,
		)
		expect(html).toContain(`>${screen[0]?.toUpperCase()}${screen.slice(1)}</h1>`)
		expect(html).toContain(`aria-current="page"`)
		expect(html).toContain('aria-label="Main navigation"')
		expect(html).toContain('aria-label="Phone navigation"')
		if (screen === "settings") {
			expect(html).toContain("POS settings")
			expect(html).toContain("tab=kizlo&amp;section=pos")
			expect(html).toContain("Store Manager")
			expect(html).toContain("Logging out ends your current WordPress session")
		} else if (screen === "more") {
			expect(html).toContain('aria-label="More destinations"')
		} else if (screen === "products") {
			expect(html).toContain("Search products")
		} else {
			expect(html).toContain("COMING NEXT")
		}
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
			<MemoryRouter>
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
				<MemoryRouter>
					<App data={data} />
				</MemoryRouter>,
			),
		).toContain('aria-label="Switch to dark theme"')
	})
})
