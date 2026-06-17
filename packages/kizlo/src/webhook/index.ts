import { type Pathname, type Schema, type SchemaOutput, tryCatchSync, verifyWebhook } from "@kizlo/shared"
import z from "zod"
import type { ServerContext } from "../context"
import { KizloError } from "../shared/error"
import { createProcedure } from "../shared/procedure"
import { AnyWebhookEvent, type WebhookEvent } from "./schema"
import { validateWebhookEvent } from "./utils"

export type AnyWebhookEventSchema<TData = unknown> = Schema<unknown, TData>

export type AnyWebhookEvents = { types: string[]; data: AnyWebhookEventSchema }[]

export type InferWebhookEventUnion<T extends AnyWebhookEvents> = {
	[K in keyof T]: { type: T[K]["types"][number]; data: SchemaOutput<T[K]["data"]> }
}[number]

export type WebhookHandlerFn<T extends AnyWebhookEvents> = (
	event: InferWebhookEventUnion<T> | WebhookEvent | null,
	context: ServerContext,
) => Promise<void> | void

export interface WebhookOptions {
	path?: Pathname
	events?: EventHandler[]
}

export interface EventHandler {
	events?: AnyWebhookEvents
	handler: WebhookHandlerFn<AnyWebhookEvents>
}

export function createEventHandler<const T extends AnyWebhookEvents = never>(handler: WebhookHandlerFn<T>): EventHandler
export function createEventHandler<const T extends AnyWebhookEvents = never>(events: T, handler: WebhookHandlerFn<T>): EventHandler
export function createEventHandler(
	eventsOrHandler: AnyWebhookEvents | WebhookHandlerFn<AnyWebhookEvents>,
	maybeHandler?: WebhookHandlerFn<AnyWebhookEvents>,
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
				body: AnyWebhookEvent,
				path: options?.path ?? "/webhooks",
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
						const event = await validateWebhookEvent(events, input.body)
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
