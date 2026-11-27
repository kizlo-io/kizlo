import { type Schema, type SchemaOutput, tryCatchSync, verifyWebhook } from "@kizlo/shared"
import { KizloError } from "../shared/error"
import { AnyEvent, type KizloEvent } from "./schema"
import { validateEvent } from "./utils"

export type AnyEventSchema<TData = unknown> = Schema<unknown, TData>

export type AnyEvents = {
	/** Event type strings this entry matches, e.g. `["review.created"]`. The handler's `event.type` is narrowed to this union. */
	types: string[]
	/** Standard Schema that validates and types each matched event's `data` payload. */
	data: AnyEventSchema
}[]

export type InferEventUnion<T extends AnyEvents> = {
	[K in keyof T]: { type: T[K]["types"][number]; data: SchemaOutput<T[K]["data"]> }
}[number]

export type EventHandlerFn<T extends AnyEvents> = (
	event: InferEventUnion<T> | KizloEvent | null,
	context: WebhookContext,
) => Promise<void> | void

export interface WebhookContext {
	request: Request
	headers: Headers
	logger: Pick<Console, "error">
}

export interface WebhookOptions {
	secret: string
	events?: EventHandler[]
	logger?: Pick<Console, "error">
}

export interface EventHandler {
	/** Required handlers fail acknowledgement so the sender can retry. Defaults to log-only. */
	failureMode?: "log" | "retry"
	events?: AnyEvents
	handler: EventHandlerFn<AnyEvents>
}

export function createEventHandler<const T extends AnyEvents = never>(handler: EventHandlerFn<T>): EventHandler
export function createEventHandler<const T extends AnyEvents = never>(events: T, handler: EventHandlerFn<T>): EventHandler
export function createEventHandler(
	eventsOrHandler: AnyEvents | EventHandlerFn<AnyEvents>,
	maybeHandler?: EventHandlerFn<AnyEvents>,
): EventHandler {
	const events = Array.isArray(eventsOrHandler) ? eventsOrHandler : []
	const handler = Array.isArray(eventsOrHandler) ? maybeHandler : eventsOrHandler
	if (!handler) throw new Error("Event handler not defined.")
	return { events, handler } as EventHandler
}

/** A signed webhook receiver independent of the client and application procedure framework. */
export function createWebhookHandler(options: WebhookOptions): (request: Request) => Promise<Response> {
	if (!options.secret) throw new TypeError("A webhook signing secret is required")
	return async (request) => {
		if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } })
		const headers = new Headers()
		headers.set("Cache-Control", "private, no-store")
		const logger = options.logger ?? console
		const context = { request, headers, logger }
		let payload: string
		try {
			const reader = request.body?.getReader()
			const chunks: Uint8Array[] = []
			let size = 0
			if (reader) {
				try {
					for (;;) {
						const { done, value } = await reader.read()
						if (done) break
						size += value.byteLength
						if (size > 1024 * 1024) {
							await reader.cancel()
							return new Response(null, { status: 413, headers })
						}
						chunks.push(value)
					}
				} finally {
					reader.releaseLock()
				}
			}
			const body = new Uint8Array(size)
			let offset = 0
			for (const chunk of chunks) {
				body.set(chunk, offset)
				offset += chunk.length
			}
			payload = new TextDecoder().decode(body)
		} catch {
			return new Response(null, { status: 400, headers })
		}
		const [signatureError] = tryCatchSync(() =>
			verifyWebhook({ secret: options.secret, payload, headers: Object.fromEntries(request.headers) }),
		)
		if (signatureError) return new Response(null, { status: 403, headers })
		const [jsonError, decoded] = tryCatchSync(() => JSON.parse(payload))
		if (jsonError) return new Response(null, { status: 400, headers })
		const event = AnyEvent.safeParse(decoded)
		if (!event.success) return new Response(null, { status: 400, headers })
		const results = await Promise.allSettled(
			(options.events ?? []).map(async ({ events, handler, failureMode }) => {
				const validated = await validateEvent(events, event.data, failureMode)
				if (validated) await handler(validated as never, context)
			}),
		)
		for (const result of results) if (result.status === "rejected") logger.error("Webhook handler failed", result.reason)
		const required = results.find((result, index) => result.status === "rejected" && options.events?.[index]?.failureMode === "retry")
		if (required?.status === "rejected") {
			const status = required.reason instanceof KizloError && [422, 429].includes(required.reason.status) ? required.reason.status : 503
			if (status === 429) headers.set("Retry-After", "60")
			return new Response(null, { status, headers })
		}
		return new Response(null, { status: 204, headers })
	}
}
