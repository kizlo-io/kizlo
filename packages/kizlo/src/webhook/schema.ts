import z from "zod/v4"

export const TERM_WEBHOOK_EVENT_TYPES = ["term.created", "term.updated", "term.deleted"] as const
export const TermWebhookEventType = z.enum(TERM_WEBHOOK_EVENT_TYPES)
export type TermWebhookEventType = z.infer<typeof TermWebhookEventType>

export const POST_WEBHOOK_EVENT_TYPES = ["post.created", "post.updated", "post.trashed", "post.deleted"] as const
export const PostWebhookEventType = z.enum(POST_WEBHOOK_EVENT_TYPES)
export type PostWebhookEventType = z.infer<typeof PostWebhookEventType>

export const PAYMENT_WEBHOOK_EVENT_TYPES = ["payment.status_requested"] as const
export const PaymentWebhookEventType = z.enum(PAYMENT_WEBHOOK_EVENT_TYPES)
export type PaymentWebhookEventType = z.infer<typeof PaymentWebhookEventType>

export const SETTINGS_WEBHOOK_EVENT_TYPES = ["settings.saved"] as const
export const SettingsWebhookEventType = z.enum(SETTINGS_WEBHOOK_EVENT_TYPES)
export type SettingsWebhookEventType = z.infer<typeof SettingsWebhookEventType>

export const WEBHOOK_EVENT_TYPES = [
	...TERM_WEBHOOK_EVENT_TYPES,
	...POST_WEBHOOK_EVENT_TYPES,
	...PAYMENT_WEBHOOK_EVENT_TYPES,
	...SETTINGS_WEBHOOK_EVENT_TYPES,
] as const
export const WebhookEventType = z.enum(WEBHOOK_EVENT_TYPES)
export type WebhookEventType = z.infer<typeof WebhookEventType>

// ====================================================
// POST
// ====================================================

export const PostWebhookEventData = z.object({
	post_id: z.number(),
	post_type: z.string(),
})
export type PostWebhookEventData = z.infer<typeof PostWebhookEventData>

export const PostWebhookEvent = z.object({ type: PostWebhookEventType, data: PostWebhookEventData })
export type PostWebhookEvent = z.infer<typeof PostWebhookEvent>

// ====================================================
// TERM
// ====================================================

export const TermWebhookEventData = z.object({
	term_id: z.number(),
	taxonomy: z.string(),
	post_types: z.array(z.string()),
	count: z.number().nonnegative(),
})
export type TermWebhookEventData = z.infer<typeof TermWebhookEventData>

export const TermWebhookEvent = z.object({ type: TermWebhookEventType, data: TermWebhookEventData })
export type TermWebhookEvent = z.infer<typeof TermWebhookEvent>

// ====================================================
// PAYMENT
// ====================================================

export const PaymentWebhookEventData = z.object({
	transaction_id: z.nullable(z.string()),
	payment_method_id: z.string(),
	payment_session_id: z.string(),
})
export type PaymentWebhookEventData = z.infer<typeof PaymentWebhookEventData>

export const PaymentWebhookEvent = z.object({ type: PaymentWebhookEventType, data: PaymentWebhookEventData })
export type PaymentWebhookEvent = z.infer<typeof PaymentWebhookEvent>

// ====================================================
// SETTINGS
// ====================================================

export const SettingsWebhookEventData = z.null()
export type SettingsWebhookEventData = z.infer<typeof SettingsWebhookEventData>

export const SettingsWebhookEvent = z.object({ type: SettingsWebhookEventType, data: SettingsWebhookEventData })
export type SettingsWebhookEvent = z.infer<typeof SettingsWebhookEvent>

// ====================================================
// WEBHOOK
// ====================================================

export const WebhookEvent = z.union([PostWebhookEvent, TermWebhookEvent, PaymentWebhookEvent, SettingsWebhookEvent])
export type WebhookEvent = z.infer<typeof WebhookEvent>

export const AnyWebhookEvent = z.object({ type: z.string(), data: z.unknown() })
export type AnyWebhookEvent = z.infer<typeof AnyWebhookEvent>
