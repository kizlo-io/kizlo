import { beforeEach, expect, test, vi } from "vitest"
import { Kizlo } from "../../kizlo"
import { createIntegration } from "../../shared/integration"
import { nextjs } from "./integration"
import { createNextCookiesInterface } from "./utils"

const { cookieJar, readCookies } = vi.hoisted(() => ({
	readCookies: vi.fn(),
	cookieJar: {
		delete: vi.fn(),
		getAll: vi.fn(),
		set: vi.fn(),
	},
}))

vi.mock("next/headers", () => ({
	cookies: readCookies,
}))

beforeEach(() => {
	vi.clearAllMocks()
	readCookies.mockResolvedValue(cookieJar)
	cookieJar.getAll.mockReturnValue([{ name: "session", value: "token" }])
})

function server(integrations: ReturnType<typeof createIntegration>[]) {
	return new Kizlo({
		baseUrl: "https://app.example/api/kizlo",
		siteSecret: "secret",
		credentials: { url: "https://wordpress.example", username: "admin", password: "password" },
		integrations,
	})
}

test("registers Next.js cookies without reading them until the server needs them", async () => {
	const integration = nextjs({ env: {}, revalidate: false })
	const session = { id: "customer", email: "customer@example.com" }
	const getSession = vi.fn(async (request: Request | null) => (request?.headers.get("cookie") === "session=token" ? session : null))
	const context = server([integration, createIntegration({ id: "auth", adapters: { auth: { getSession } } })]).context.createServerContext()

	expect(integration.adapters?.cookies?.getAll).toBeTypeOf("function")
	expect(readCookies).not.toHaveBeenCalled()
	await expect(context.cookies.get("session")).resolves.toBe("token")
	expect(readCookies).toHaveBeenCalledTimes(1)
	await expect(context.getSession()).resolves.toEqual(session)
	expect(getSession.mock.calls[0]?.[0]?.url).toBe("https://app.example/api/kizlo")
})

test.each([true, false])("preserves an explicit cookies override when Next.js is declared first: %s", async (frameworkFirst) => {
	const cookies = { getAll: vi.fn(() => [{ name: "session", value: "override" }]), setAll: vi.fn(), deleteAll: vi.fn() }
	const application = createIntegration({ id: "application", adapters: { cookies } })
	const framework = nextjs({ env: {}, revalidate: false })
	const context = server(frameworkFirst ? [framework, application] : [application, framework]).context.createServerContext()

	expect(context.config.adapters?.cookies).toBe(cookies)
	await expect(context.cookies.get("session")).resolves.toBe("override")
	expect(readCookies).not.toHaveBeenCalled()
})

test("deletes a cookie from the path its caller supplied", async () => {
	await createNextCookiesInterface().deleteAll([{ name: "guest-session", options: { path: "/" } }])

	expect(cookieJar.delete).toHaveBeenCalledWith({ name: "guest-session", path: "/" })
})
