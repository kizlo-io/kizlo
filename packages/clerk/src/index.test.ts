import { createHash, generateKeyPairSync, sign } from "node:crypto"
import { createClerkClient } from "@clerk/backend"
import { createIntegration, Kizlo } from "kizlo"
import { describe, expect, it, vi } from "vitest"
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

describe("cookie authentication with Clerk verification", () => {
	const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
	const publishableKey = `pk_test_${Buffer.from("clerk.example$").toString("base64")}`
	const suffix = createHash("sha1").update(publishableKey).digest("base64url").slice(0, 8)

	function token(expired = false) {
		const now = Math.floor(Date.now() / 1000)
		const payload = {
			sub: "user_cookie",
			sid: "sess_cookie",
			iss: "https://clerk.example",
			azp: "https://app.example",
			iat: now - 120,
			nbf: now - 120,
			exp: now + (expired ? -90 : 300),
		}
		const body = `${Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "test-key" })).toString("base64url")}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}`
		return `${body}.${sign("RSA-SHA256", Buffer.from(body), privateKey).toString("base64url")}`
	}

	function server(cookies: { name: string; value: string }[]) {
		const client = createClerkClient({
			telemetry: { disabled: true },
			publishableKey,
			secretKey: "sk_test_local",
			jwtKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
		})
		const getUser = vi
			.spyOn(client.users, "getUser")
			.mockResolvedValue(clerkUserFixture({ id: "user_cookie", emails: [{ email: "cookie@example.com" }] }))
		const integrations = [
			clerk({ client }),
			createIntegration({ id: "cookies", adapters: { cookies: { getAll: () => cookies, setAll: vi.fn(), deleteAll: vi.fn() } } }),
		] as const
		const kizlo = new Kizlo<typeof integrations>({
			baseUrl: "https://app.example/api/kizlo",
			siteSecret: "secret",
			credentials: { url: "https://wordpress.example", username: "admin", password: "password" },
			integrations,
		})
		return { context: kizlo.context, getUser }
	}

	it.each(["", `_${suffix}`])("resolves the same identity from server and HTTP cookies with suffix %j", async (suffix) => {
		const cookies = [
			{ name: `__session${suffix}`, value: token() },
			{ name: `__client_uat${suffix}`, value: "1" },
			{ name: `__clerk_db_jwt${suffix}`, value: "dev-browser" },
		]
		const { context, getUser } = server(cookies)
		const cookie = cookies.map(({ name, value }) => `${name}=${value}`).join("; ")
		const expected = { id: "user_cookie", email: "cookie@example.com" }

		await expect(context.createServerContext().getSession()).resolves.toEqual(expected)
		await expect(
			context.createRestContext(new Request("https://app.example/api/kizlo", { headers: { cookie } })).getSession(),
		).resolves.toEqual(expected)
		expect(getUser).toHaveBeenCalledTimes(2)
		expect(getUser).toHaveBeenCalledWith("user_cookie")
	})

	it.each(["missing", "invalid", "expired"])("keeps a %s session signed out without looking up a user", async (kind) => {
		const valid = token()
		const invalid = `${valid.slice(0, valid.lastIndexOf("."))}.${Buffer.alloc(256).toString("base64url")}`
		const cookies =
			kind === "missing"
				? []
				: [
						{ name: "__session", value: kind === "expired" ? token(true) : invalid },
						{ name: "__client_uat", value: "1" },
						{ name: "__clerk_db_jwt", value: "dev-browser" },
					]
		const { context, getUser } = server(cookies)

		await expect(context.createServerContext().getSession()).resolves.toBeNull()
		expect(getUser).not.toHaveBeenCalled()
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

	it("uses the primary email when it is unverified", async () => {
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

		expect(session?.email).toBe("primary@home.com")
	})

	it("uses resolveEmail when no primary email exists", async () => {
		const session = await adapterFor(
			{ resolveEmail: (user) => `phone+${user.id}@example.com` },
			{ id: "user_4", phones: [{ phone: "+1 (415) 555-0100", primary: true }] },
		).getSession(request())

		expect(session?.email).toBe("phone+user_4@example.com")
	})

	it("throws naming the missing option when no email can be resolved", async () => {
		const adapter = adapterFor({}, { id: "user_5", phones: [{ phone: "+14155550100" }] })
		await expect(adapter.getSession(request())).rejects.toThrow(/resolveEmail/)
	})

	it("prefers the primary email over resolveEmail and every secondary address", async () => {
		const resolveEmail = vi.fn(() => "custom@x.com")
		const session = await adapterFor(
			{ resolveEmail },
			{
				id: "user_6",
				emails: [
					{ email: "secondary@x.com", verified: true },
					{ email: "primary@x.com", verified: false, primary: true },
				],
			},
		).getSession(request())

		expect(session?.email).toBe("primary@x.com")
		expect(resolveEmail).not.toHaveBeenCalled()
	})
})
