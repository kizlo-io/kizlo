import { createHmac } from "node:crypto"
import type { ClerkClient, WebhookEvent } from "@clerk/backend"
import { assertIntegrationEndpoints, type ProcedureContext } from "kizlo"
import { describe, expect, it, vi } from "vitest"
import { type ClerkOptions, type ClerkWebhookHandler, clerk } from "./index"
import { clerkClientFixture, clerkUserFixture } from "./test/index"

const SIGNING_KEY = Buffer.from("kizlo-clerk-webhook-test-secret!")
const SIGNING_SECRET = `whsec_${SIGNING_KEY.toString("base64")}`

describe("Clerk webhook integration", () => {
	it.each([
		["user.created", "create"],
		["user.updated", "update"],
	] as const)("maps a verified %s event through the external-user %s endpoint", async (type, operation) => {
		const user = clerkUserFixture({
			id: "user_1",
			firstName: "Grace",
			lastName: "Hopper",
			username: "grace",
			imageUrl: "https://example.com/grace.jpg",
			publicMetadata: { plan: "pro" },
			emails: [{ email: "grace@example.com", primary: true, verified: false }],
		})
		const client = clerkClientFixture({ user })
		const wordpress = wordpressFixture()
		const event = webhookEvent(type, { id: user.id })

		await invokeWebhook({ client, webhooks: { signingSecret: SIGNING_SECRET } }, signedRequest(event), wordpress)

		expect(wordpress.users.external[operation]).toHaveBeenCalledWith({
			provider: "clerk",
			value: "user_1",
			email: "grace@example.com",
			first_name: "Grace",
			last_name: "Hopper",
			profile: {
				username: "grace",
				imageUrl: "https://example.com/grace.jpg",
				publicMetadata: { plan: "pro" },
			},
		})
		expect(wordpress.users.external[operation === "create" ? "update" : "create"]).not.toHaveBeenCalled()
		expect(wordpress.users.external.delete).not.toHaveBeenCalled()
	})

	it("deletes by stable Clerk id without retrieving a user", async () => {
		const getUser = vi.fn()
		const client = { users: { getUser } } as unknown as ClerkClient
		const wordpress = wordpressFixture()
		const event = webhookEvent("user.deleted", { id: "user_deleted", deleted: true })

		await invokeWebhook({ client, webhooks: { signingSecret: SIGNING_SECRET } }, signedRequest(event), wordpress)

		expect(wordpress.users.external.delete).toHaveBeenCalledWith({ provider: "clerk", value: "user_deleted" })
		expect(getUser).not.toHaveBeenCalled()
		expect(wordpress.users.external.create).not.toHaveBeenCalled()
		expect(wordpress.users.external.update).not.toHaveBeenCalled()
	})

	it("acknowledges a verified non-user event without mutating WordPress", async () => {
		const wordpress = wordpressFixture()
		const event = webhookEvent("session.created", { id: "sess_1" })

		await invokeWebhook({ client: clerkClientFixture(), webhooks: { signingSecret: SIGNING_SECRET } }, signedRequest(event), wordpress)

		expect(wordpress.users.external.create).not.toHaveBeenCalled()
		expect(wordpress.users.external.update).not.toHaveBeenCalled()
		expect(wordpress.users.external.delete).not.toHaveBeenCalled()
	})

	it.each([
		["user.created", { id: "user_1" }],
		["session.created", { id: "sess_1" }],
	] as const)("sends every verified %s event to a custom handler and skips built-in CRUD", async (type, data) => {
		let originalBody = ""
		const handler = vi.fn<ClerkWebhookHandler>(async (_event, context) => {
			originalBody = (await context.request?.text()) ?? ""
		})
		const wordpress = wordpressFixture()
		const event = webhookEvent(type, data)
		const request = signedRequest(event)

		await invokeWebhook({ client: clerkClientFixture(), webhooks: { signingSecret: SIGNING_SECRET, handler } }, request, wordpress)

		expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type, data }), expect.objectContaining({ request }))
		expect(JSON.parse(originalBody)).toMatchObject({ type, data })
		expect(wordpress.users.external.create).not.toHaveBeenCalled()
		expect(wordpress.users.external.update).not.toHaveBeenCalled()
		expect(wordpress.users.external.delete).not.toHaveBeenCalled()
	})

	it.each([
		["missing signatures", new Request("https://example.com/clerk/webhooks", { method: "POST", body: "{}" })],
		[
			"an invalid signature",
			new Request("https://example.com/clerk/webhooks", {
				method: "POST",
				body: "{}",
				headers: {
					"svix-id": "msg_bad",
					"svix-timestamp": String(Math.floor(Date.now() / 1000)),
					"svix-signature": "v1,invalid",
				},
			}),
		],
	])("rejects %s before custom or default handling", async (_label, request) => {
		const handler = vi.fn<ClerkWebhookHandler>()
		const wordpress = wordpressFixture()

		await expect(
			invokeWebhook({ client: clerkClientFixture(), webhooks: { signingSecret: SIGNING_SECRET, handler } }, request, wordpress),
		).rejects.toMatchObject({ code: "FORBIDDEN" })
		expect(handler).not.toHaveBeenCalled()
		expect(wordpress.users.external.create).not.toHaveBeenCalled()
		expect(wordpress.users.external.update).not.toHaveBeenCalled()
		expect(wordpress.users.external.delete).not.toHaveBeenCalled()
	})

	it("registers the route and endpoint requirement only for built-in webhook handling", () => {
		const client = clerkClientFixture()
		const authOnly = clerk({ client })
		const builtIn = clerk({ client, webhooks: { signingSecret: SIGNING_SECRET } })
		const custom = clerk({ client, webhooks: { signingSecret: SIGNING_SECRET, handler: vi.fn() } })

		expect(authOnly.procedures).toBeUndefined()
		expect(authOnly.requires).toBeUndefined()
		expect(builtIn.procedures?.webhooks["~kizlo"].options).toMatchObject({
			scope: "api",
			method: "POST",
			path: "/webhooks",
		})
		expect(builtIn.requires?.endpoints).toEqual(["users.external"])
		expect(custom.procedures?.webhooks).toBeDefined()
		expect(custom.requires).toBeUndefined()
	})

	it("reports missing external-user endpoints at startup", () => {
		const integration = clerk({ client: clerkClientFixture(), webhooks: { signingSecret: SIGNING_SECRET } })

		expect(() => assertIntegrationEndpoints(integration, {})).toThrow(
			/The "clerk" integration needs WordPress endpoints.*users\.external.*kizlo generate/,
		)
	})
})

type WordPressFixture = ReturnType<typeof wordpressFixture>

function wordpressFixture() {
	const success = async () => ({ data: {}, error: null })
	return {
		users: {
			external: {
				create: vi.fn(success),
				update: vi.fn(success),
				delete: vi.fn(async () => ({ data: { deleted: true }, error: null })),
			},
		},
	}
}

async function invokeWebhook(options: ClerkOptions, request: Request, wordpress: WordPressFixture): Promise<void> {
	const procedure = clerk(options).procedures?.webhooks
	if (!procedure) throw new Error("expected the Clerk webhook procedure")

	await procedure["~kizlo"].handler({
		context: { request, wordpress } as unknown as ProcedureContext,
		errors: {},
		input: {},
	} as never)
}

function webhookEvent(type: string, data: Record<string, unknown>): WebhookEvent {
	return {
		type,
		object: "event",
		data,
		event_attributes: { http_request: { client_ip: "127.0.0.1", user_agent: "vitest" } },
	} as unknown as WebhookEvent
}

function signedRequest(event: WebhookEvent): Request {
	const body = JSON.stringify(event)
	const id = `msg_${crypto.randomUUID()}`
	const timestamp = String(Math.floor(Date.now() / 1000))
	const signature = createHmac("sha256", SIGNING_KEY).update(`${id}.${timestamp}.${body}`).digest("base64")

	return new Request("https://example.com/clerk/webhooks", {
		method: "POST",
		body,
		headers: {
			"content-type": "application/json",
			"svix-id": id,
			"svix-timestamp": timestamp,
			"svix-signature": `v1,${signature}`,
		},
	})
}
