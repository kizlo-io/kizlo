import { describe, expect, test, vi } from "vitest"
import { sessionMiddleware } from "./session"

const SECRET = "a sufficiently long session test secret"
const EMAIL = "shopper@example.com"

type StoredCookie = {
	name: string
	value: string
	options: { httpOnly: boolean; maxAge?: number; path: string; sameSite: string }
}

async function mintCookie(): Promise<StoredCookie> {
	let stored: StoredCookie | undefined
	const context = testContext({
		session: null,
		cookie: null,
		set: (cookie) => {
			stored = cookie
		},
	})

	await run(sessionMiddleware(), context, async (injected) => ({ output: null, context: injected }))
	if (!stored) throw new Error("The guest middleware did not set a cookie.")
	return stored
}

describe("sessionMiddleware", () => {
	test.each([null, "valid", "malformed"])("rejects protected checkout before cookie effects (%s)", async (token) => {
		const cookie = token === "valid" ? (await mintCookie()).value : token
		const set = vi.fn()
		const remove = vi.fn()
		const next = vi.fn()
		const context = testContext({ session: null, cookie, set, remove })
		const readCookie = vi.spyOn(context.cookies, "get")
		const getSession = vi.spyOn(context, "getSession")
		const getConnInfo = vi.spyOn(context, "getConnInfo")

		await expect(run(sessionMiddleware({ allowGuest: false }), context, next)).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			status: 401,
		})
		expect(getSession).toHaveBeenCalledOnce()
		expect(readCookie).not.toHaveBeenCalled()
		expect(getConnInfo).not.toHaveBeenCalled()
		expect(set).not.toHaveBeenCalled()
		expect(remove).not.toHaveBeenCalled()
		expect(next).not.toHaveBeenCalled()
	})

	test("propagates adapter failure before guest cookie effects", async () => {
		const set = vi.fn()
		const next = vi.fn()
		const context = testContext({ session: null, cookie: null, set })
		const failure = new Error("Auth unavailable")
		vi.spyOn(context, "getSession").mockImplementation(() => {
			throw failure
		})

		await expect(run(sessionMiddleware({ allowGuest: false }), context, next)).rejects.toBe(failure)
		expect(set).not.toHaveBeenCalled()
		expect(next).not.toHaveBeenCalled()
	})

	test("reuses one authenticated session for protected checkout and the guest cart transition", async () => {
		const cookie = await mintCookie()
		const remove = vi.fn()
		const context = testContext({ session: { email: EMAIL }, cookie: cookie.value, remove })
		const getSession = vi.spyOn(context, "getSession")

		await run(sessionMiddleware({ allowGuest: false, transitionGuestCart: true }), context, async (injected) => {
			expect(injected.sessionHeaders).toMatchObject({
				"X-Kizlo-User-Email": EMAIL,
				"X-Kizlo-Guest-Token": expect.stringMatching(/^t_[a-f0-9]{30}$/),
			})
			return { output: "checkout", context: injected }
		})
		expect(getSession).toHaveBeenCalledOnce()
		expect(remove).toHaveBeenCalledOnce()
	})

	test("aligns the guest cookie with the 48-hour signed-token lifetime", async () => {
		const cookie = await mintCookie()

		expect(cookie.name).toBe("guest-session")
		expect(cookie.options).toEqual({ httpOnly: true, maxAge: 172800, path: "/", sameSite: "lax" })
	})

	test("forwards both identities on one authenticated cart request and cleans up after success", async () => {
		const cookie = await mintCookie()
		const events: string[] = []
		const remove = vi.fn(() => {
			events.push("delete")
		})
		const context = testContext({ session: { email: EMAIL }, cookie: cookie.value, remove, headers: new Headers() })

		await run(sessionMiddleware({ transitionGuestCart: true }), context, async (injected) => {
			events.push("next")
			expect(injected.sessionHeaders).toMatchObject({
				"X-Kizlo-Guest-Token": expect.stringMatching(/^t_[a-f0-9]{30}$/),
				"X-Kizlo-User-Email": EMAIL,
			})
			return { output: "cart", context: injected }
		})

		expect(events).toEqual(["next", "delete"])
		expect(remove).toHaveBeenCalledOnce()
	})

	test("retains the cookie when the original operation fails", async () => {
		const cookie = await mintCookie()
		const remove = vi.fn()
		const context = testContext({ session: { email: EMAIL }, cookie: cookie.value, remove, headers: new Headers() })

		await expect(
			run(sessionMiddleware({ transitionGuestCart: true }), context, async () => {
				throw new Error("WordPress failed")
			}),
		).rejects.toThrow("WordPress failed")
		expect(remove).not.toHaveBeenCalled()
	})

	test("retains the cookie for a successful direct server invocation", async () => {
		const cookie = await mintCookie()
		const remove = vi.fn()
		const context = testContext({ session: { email: EMAIL }, cookie: cookie.value, remove, headers: null })

		await run(sessionMiddleware({ transitionGuestCart: true }), context, async (injected) => ({ output: "cart", context: injected }))

		expect(remove).not.toHaveBeenCalled()
	})

	test("order operations send only the authenticated user identity", async () => {
		const cookie = await mintCookie()
		const remove = vi.fn()
		const context = testContext({ session: { email: EMAIL }, cookie: cookie.value, remove, headers: new Headers() })

		await run(sessionMiddleware(), context, async (injected) => {
			expect(injected.sessionHeaders).toEqual({ "X-Kizlo-User-Email": EMAIL })
			return { output: "order", context: injected }
		})

		expect(remove).not.toHaveBeenCalled()
	})
})

function testContext(options: {
	session: { email: string } | null
	cookie: string | null
	headers?: Headers | null
	remove?: () => void
	set?: (cookie: StoredCookie) => void
}) {
	return {
		config: { siteSecret: SECRET },
		cookies: {
			delete: options.remove ?? (() => {}),
			get: () => options.cookie,
			set: options.set ?? (() => {}),
		},
		getSession: () => options.session,
		getConnInfo: () => null,
		headers: options.headers === undefined ? new Headers() : options.headers,
		wordpress: new Proxy(
			{},
			{
				get() {
					throw new Error("Session middleware must not make a preliminary WordPress request.")
				},
			},
		),
	}
}

async function run(
	middleware: ReturnType<typeof sessionMiddleware>,
	context: ReturnType<typeof testContext>,
	next: (context: { sessionHeaders: Record<string, string> }) => Promise<{ output: unknown; context: unknown }>,
) {
	return middleware({
		context,
		errors: {},
		input: {},
		next: (options: { context: { sessionHeaders: Record<string, string> } }) => next(options.context),
	} as never)
}
