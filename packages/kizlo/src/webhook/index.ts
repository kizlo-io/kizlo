import { type Schema, type SchemaOutput, tryCatchSync, verifyWebhook } from "@kizlo/shared"
import z from "zod"
import type { ServerContext } from "../context"
import { KizloError } from "../shared/error"
import { createProcedure } from "../shared/procedure"
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
	context: ServerContext,
) => Promise<void> | void

export interface WebhookOptions {
	events?: EventHandler[]
}

export interface EventHandler {
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

export function createWebhookRouter(options?: WebhookOptions) {
	return {
		webhooks: createProcedure(
			{
				scope: "api",
				method: "POST",
				body: AnyEvent,
				path: "/webhooks",
				output: z.void(),
			},
			async ({ context, input }) => {
				const payload = (await context.request?.text()) ?? ""
				const headers = Object.fromEntries(context.request?.headers.entries() ?? [])
				const [err] = tryCatchSync(() => verifyWebhook({ secret: context.config.siteSecret, payload, headers }))
				if (err) {
					throw new KizloError("FORBIDDEN", { message: "Signature verification failed." })
				}

				const results = await Promise.allSettled(
					(options?.events ?? []).map(async ({ events, handler }) => {
						const event = await validateEvent(events, input.body)
						if (!event) return
						await handler(event as never, context)
					}),
				)

				for (const result of results) {
					if (result.status === "rejected") {
						context.logger.error("Webhook handler failed", result.reason as Error)
					}
				}
			},
		),
	}
}
