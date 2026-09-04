import { beforeEach, describe, expect, it, vi } from "vitest"
import { type ClerkOptions, clerk } from "./index"
import { clerkUserFixture } from "./test/index"

const authenticateRequest = vi.fn()
const getUser = vi.fn()

vi.mock("@clerk/backend", () => ({
	createClerkClient: () => ({
		authenticateRequest,
		users: { getUser },
	}),
}))

function adapterFor(options: Partial<ClerkOptions> = {}) {
	const integration = clerk({ secretKey: "sk_test", publishableKey: "pk_test", ...options })
	const auth = integration.adapters?.auth
	if (!auth) throw new Error("expected the clerk integration to contribute an auth adapter")
	return auth
}

function signedIn(userId: string) {
	authenticateRequest.mockResolvedValue({ isSignedIn: true, toAuth: () => ({ userId }) })
}

const request = () => new Request("https://example.com")

beforeEach(() => {
	vi.clearAllMocks()
})

describe("clerk integration", () => {
	it("registers with id 'clerk' and contributes the auth adapter", () => {
		const integration = clerk({ secretKey: "sk_test", publishableKey: "pk_test" })
		expect(integration.id).toBe("clerk")
		expect(integration.adapters?.auth?.getSession).toBeTypeOf("function")
	})
})

describe("getSession", () => {
	it("maps a valid session to the AuthUser contract", async () => {
		signedIn("user_1")
		getUser.mockResolvedValue(
			clerkUserFixture({
				id: "user_1",
				firstName: "Karan",
				lastName: "Gill",
				username: "karang",
				publicMetadata: { plan: "pro" },
				emails: [{ email: "karan@gmail.com", primary: true }],
			}),
		)

		const session = await adapterFor().getSession(request())

		expect(session).toEqual({
			id: "user_1",
			email: "karan@gmail.com",
			firstName: "Karan",
			lastName: "Gill",
			meta: { username: "karang", publicMetadata: { plan: "pro" } },
		})
	})

	it("returns null for an unauthenticated request and never fetches the user", async () => {
		authenticateRequest.mockResolvedValue({ isSignedIn: false })

		const session = await adapterFor().getSession(request())

		expect(session).toBeNull()
		expect(getUser).not.toHaveBeenCalled()
	})

	it("returns null for a non-HTTP (null) invocation without verifying anything", async () => {
		const session = await adapterFor().getSession(null)

		expect(session).toBeNull()
		expect(authenticateRequest).not.toHaveBeenCalled()
	})

	it("uses the primary email when it is verified", async () => {
		signedIn("user_2")
		getUser.mockResolvedValue(
			clerkUserFixture({
				id: "user_2",
				emails: [
					{ email: "secondary@work.com", verified: true },
					{ email: "primary@home.com", verified: true, primary: true },
				],
			}),
		)

		const session = await adapterFor().getSession(request())

		expect(session?.email).toBe("primary@home.com")
	})

	it("falls back to another verified email when the primary is unverified", async () => {
		signedIn("user_3")
		getUser.mockResolvedValue(
			clerkUserFixture({
				id: "user_3",
				emails: [
					{ email: "primary@home.com", verified: false, primary: true },
					{ email: "verified@work.com", verified: true },
				],
			}),
		)

		const session = await adapterFor().getSession(request())

		expect(session?.email).toBe("verified@work.com")
	})

	it("synthesizes an email for a phone-only user when emailDomain is set", async () => {
		signedIn("user_4")
		getUser.mockResolvedValue(clerkUserFixture({ id: "user_4", phones: [{ phone: "+1 (415) 555-0100", primary: true }] }))

		const session = await adapterFor({ emailDomain: "phone.example.com" }).getSession(request())

		expect(session?.email).toBe("14155550100@phone.example.com")
	})

	it("throws naming the missing option when no email can be resolved", async () => {
		signedIn("user_5")
		getUser.mockResolvedValue(clerkUserFixture({ id: "user_5", phones: [{ phone: "+14155550100" }] }))

		await expect(adapterFor().getSession(request())).rejects.toThrow(/emailDomain/)
	})

	it("lets resolveEmail take over the mapping", async () => {
		signedIn("user_6")
		getUser.mockResolvedValue(clerkUserFixture({ id: "user_6", emails: [{ email: "ignored@x.com", primary: true }] }))

		const session = await adapterFor({ resolveEmail: (user) => `custom+${user.id}@x.com` }).getSession(request())

		expect(session?.email).toBe("custom+user_6@x.com")
	})
})
