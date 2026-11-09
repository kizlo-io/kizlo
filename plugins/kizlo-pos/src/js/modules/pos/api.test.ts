import { afterEach, describe, expect, it, vi } from "vitest"

const fetchMock = vi.hoisted(() => ({
	use: vi.fn(),
	createRootURLMiddleware: vi.fn(() => "root"),
	createNonceMiddleware: vi.fn(() => "nonce"),
}))
vi.mock("@wordpress/api-fetch", () => ({ default: fetchMock }))

import { apiProblem, configureApi } from "./api"
import { data } from "./test-data"

afterEach(() => {
	vi.clearAllMocks()
	vi.unstubAllGlobals()
})

describe("POS API initialization", () => {
	it("installs the site's root and WordPress nonce before calls", () => {
		configureApi(data)
		expect(fetchMock.createRootURLMiddleware).toHaveBeenCalledWith(data.restRoot)
		expect(fetchMock.createNonceMiddleware).toHaveBeenCalledWith(data.nonce)
		expect(fetchMock.use.mock.calls.map(([middleware]) => middleware).slice(0, 2)).toEqual(["root", "nonce"])
	})
	it("reports failures to the shell and preserves the rejected request", async () => {
		const dispatchEvent = vi.fn()
		vi.stubGlobal("window", { dispatchEvent })
		configureApi(data)
		const middleware = fetchMock.use.mock.calls[2]?.[0]
		const error = { code: "rest_cookie_invalid_nonce", data: { status: 403 } }
		await expect(middleware({}, () => Promise.reject(error))).rejects.toBe(error)
		expect(dispatchEvent.mock.calls[0]?.[0].detail.action).toBe("reload")
	})
	it("offers login for an ended session and preserves other errors", () => {
		expect(apiProblem({ data: { status: 401 } }).action).toBe("login")
		expect(apiProblem({ message: "Permission denied", data: { status: 403 } })).toEqual({ message: "Permission denied", action: null })
		expect(apiProblem(null).message).toBe("The request failed. Please try again.")
	})
})
