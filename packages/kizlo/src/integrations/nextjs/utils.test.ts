import { beforeEach, expect, test, vi } from "vitest"
import { createNextCookiesInterface } from "./utils"

const { cookieJar } = vi.hoisted(() => ({
	cookieJar: {
		delete: vi.fn(),
		getAll: vi.fn(),
		set: vi.fn(),
	},
}))

vi.mock("next/headers", () => ({
	cookies: async () => cookieJar,
}))

beforeEach(() => {
	vi.clearAllMocks()
})

test("deletes a cookie from the path its caller supplied", async () => {
	await createNextCookiesInterface().deleteAll([{ name: "guest-session", options: { path: "/" } }])

	expect(cookieJar.delete).toHaveBeenCalledWith({ name: "guest-session", path: "/" })
})
