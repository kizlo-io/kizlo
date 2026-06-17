import { safeValidateSchema } from "@kizlo/shared"
import type { AnyWebhookEvents, InferWebhookEventUnion } from "."
import { type AnyWebhookEvent, WebhookEvent } from "./schema"

export async function validateWebhookEvent<T extends AnyWebhookEvents>(
	events: T | undefined,
	data: AnyWebhookEvent,
): Promise<WebhookEvent | InferWebhookEventUnion<T> | null> {
	const internal = await safeValidateSchema(WebhookEvent, data)
	if (internal.success) return internal.value

	const external = events?.find((a) => a.types.includes(data.type))?.data
	if (external) {
		const result = await safeValidateSchema(external, data.data)
		if (!result.success) return null
		return { type: data.type, data: result.value } as never
	}

	return null
}
