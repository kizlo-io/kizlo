import { describe, expect, it } from "vitest"
import { type ClerkOptions, clerk } from "./index"
import { type ClerkUserFixtureOptions, clerkClientFixture, clerkUserFixture } from "./test/index"

function adapterFor(options: Omit<ClerkOptions, "client">, user: ClerkUserFixtureOptions | null) {
	const client = clerkClientFixture({ user: user ? clerkUserFixture(user) : null })
	const integration = clerk({ client, ...options })
	const auth = integration.adapters?.auth
	if (!auth) throw new Error("expected the clerk integration to contribute an auth adapter")
	return auth
}

const request = () => new Request("https://example.com")

describe("clerk integration", () => {
	it("registers with id 'clerk' and contributes the auth adapter", () => {
		const integration = clerk({ client: clerkClientFixture() })
		expect(integration.id).toBe("clerk")
		expect(integration.adapters?.auth?.getSession).toBeTypeOf("function")
	})
})

describe("getSession", () => {
	it("maps a valid session to the AuthUser contract", async () => {
		const session = await adapterFor(
			{},
			{
				id: "user_1",
				firstName: "Karan",
				lastName: "Gill",
				username: "karang",
				publicMetadata: { plan: "pro" },
				emails: [{ email: "karan@gmail.com", primary: true }],
			},
		).getSession(request())

		expect(session).toEqual({
			id: "user_1",
			email: "karan@gmail.com",
			firstName: "Karan",
			lastName: "Gill",
			meta: { username: "karang", publicMetadata: { plan: "pro" } },
		})
	})

	it("returns null for an unauthenticated request", async () => {
		const session = await adapterFor({}, null).getSession(request())
		expect(session).toBeNull()
	})

	it("returns null for a non-HTTP (null) invocation without verifying anything", async () => {
		const session = await adapterFor({}, { id: "user_1", emails: [{ email: "karan@gmail.com", primary: true }] }).getSession(null)
		expect(session).toBeNull()
	})

	it("uses the primary email when it is verified", async () => {
		const session = await adapterFor(
			{},
			{
				id: "user_2",
				emails: [
					{ email: "secondary@work.com", verified: true },
					{ email: "primary@home.com", verified: true, primary: true },
				],
			},
		).getSession(request())

		expect(session?.email).toBe("primary@home.com")
	})

	it("falls back to another verified email when the primary is unverified", async () => {
		const session = await adapterFor(
			{},
			{
				id: "user_3",
				emails: [
					{ email: "primary@home.com", verified: false, primary: true },
					{ email: "verified@work.com", verified: true },
				],
			},
		).getSession(request())

		expect(session?.email).toBe("verified@work.com")
	})

	it("synthesizes an email for a phone-only user when emailDomain is set", async () => {
		const session = await adapterFor(
			{ emailDomain: "phone.example.com" },
			{ id: "user_4", phones: [{ phone: "+1 (415) 555-0100", primary: true }] },
		).getSession(request())

		expect(session?.email).toBe("14155550100@phone.example.com")
	})

	it("throws naming the missing option when no email can be resolved", async () => {
		const adapter = adapterFor({}, { id: "user_5", phones: [{ phone: "+14155550100" }] })
		await expect(adapter.getSession(request())).rejects.toThrow(/emailDomain/)
	})

	it("lets resolveEmail take over the mapping", async () => {
		const session = await adapterFor(
			{ resolveEmail: (user) => `custom+${user.id}@x.com` },
			{ id: "user_6", emails: [{ email: "ignored@x.com", primary: true }] },
		).getSession(request())

		expect(session?.email).toBe("custom+user_6@x.com")
	})
})
