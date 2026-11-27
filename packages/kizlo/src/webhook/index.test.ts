import { signWebhook } from "@kizlo/shared"
import { describe, expect, test, vi } from "vitest"
import { createEventHandler, createWebhookHandler } from "./index"

const secret = "test-only-secret"
function request(payload = JSON.stringify({ type: "settings.site.updated", data: null }), timestamp = new Date(), signingSecret = secret) {
	const messageId = "message-1"
	return new Request("https://shop.example/webhook", {
		method: "POST",
		body: payload,
		headers: {
			"webhook-id": messageId,
			"webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
			"webhook-signature": signWebhook({ secret: signingSecret, messageId, timestamp, payload }),
		},
	})
}

describe("standalone webhooks", () => {
	test("verifies the raw signature and passes the event and request", async () => {
		const handler = vi.fn()
		const receive = createWebhookHandler({ secret, events: [createEventHandler(handler)] })
		const input = request()
		const response = await receive(input)
		expect(response.status).toBe(204)
		expect(response.headers.get("Cache-Control")).toBe("private, no-store")
		expect(handler).toHaveBeenCalledWith({ type: "settings.site.updated", data: null }, expect.objectContaining({ request: input }))
	})
	test.each(["forged", "expired"])("rejects %s signatures before dispatch", async (kind) => {
		const handler = vi.fn()
		const receive = createWebhookHandler({ secret, events: [createEventHandler(handler)] })
		const input = kind === "forged" ? request(undefined, undefined, "wrong") : request(undefined, new Date(Date.now() - 600_000))
		expect((await receive(input)).status).toBe(403)
		expect(handler).not.toHaveBeenCalled()
	})
	test("rejects malformed signed events and oversized bodies", async () => {
		const receive = createWebhookHandler({ secret })
		expect((await receive(request("invalid json"))).status).toBe(403)
		expect((await receive(request('{"data":null}'))).status).toBe(400)
		expect((await receive(request("x".repeat(1024 * 1024 + 1)))).status).toBe(413)
		expect((await receive(new Request("https://shop.example/webhook"))).status).toBe(405)
	})
	test.each(["retry", "log"] as const)("uses %s failure policy", async (failureMode) => {
		const logger = { error: vi.fn() }
		const receive = createWebhookHandler({
			secret,
			logger,
			events: [
				{
					...createEventHandler(() => {
						throw Error("provider unavailable")
					}),
					failureMode,
				},
			],
		})
		expect((await receive(request())).status).toBe(failureMode === "retry" ? 503 : 204)
		expect(logger.error).toHaveBeenCalledOnce()
	})
})
