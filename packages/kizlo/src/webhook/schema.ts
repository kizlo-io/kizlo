import z from "zod/v4"

export const TERM_EVENT_TYPES = ["term.created", "term.updated", "term.deleted"] as const
export const TermEventType = z.enum(TERM_EVENT_TYPES)
export type TermEventType = z.infer<typeof TermEventType>

export const POST_EVENT_TYPES = ["post.created", "post.updated", "post.trashed", "post.deleted"] as const
export const PostEventType = z.enum(POST_EVENT_TYPES)
export type PostEventType = z.infer<typeof PostEventType>

export const SETTINGS_EVENT_TYPES = ["settings.saved"] as const
export const SettingsEventType = z.enum(SETTINGS_EVENT_TYPES)
export type SettingsEventType = z.infer<typeof SettingsEventType>

export const EVENT_TYPES = [...TERM_EVENT_TYPES, ...POST_EVENT_TYPES, ...SETTINGS_EVENT_TYPES] as const
export const EventType = z.enum(EVENT_TYPES)
export type EventType = z.infer<typeof EventType>

// ====================================================
// POST
// ====================================================

export const PostEventData = z.object({
	post_id: z.number(),
	post_type: z.string(),
	url: z.string().optional(),
})
export type PostEventData = z.infer<typeof PostEventData>

export const PostEvent = z.object({ type: PostEventType, data: PostEventData })
export type PostEvent = z.infer<typeof PostEvent>

// ====================================================
// TERM
// ====================================================

export const TermEventData = z.object({
	term_id: z.number(),
	taxonomy: z.string(),
	post_types: z.array(z.string()),
	count: z.number().nonnegative(),
	url: z.string().optional(),
})
export type TermEventData = z.infer<typeof TermEventData>

export const TermEvent = z.object({ type: TermEventType, data: TermEventData })
export type TermEvent = z.infer<typeof TermEvent>

// ====================================================
// SETTINGS
// ====================================================

export const SettingsEventData = z.null()
export type SettingsEventData = z.infer<typeof SettingsEventData>

export const SettingsEvent = z.object({ type: SettingsEventType, data: SettingsEventData })
export type SettingsEvent = z.infer<typeof SettingsEvent>

// ====================================================
// EVENT
// ====================================================

export const KizloEvent = z.union([PostEvent, TermEvent, SettingsEvent])
export type KizloEvent = z.infer<typeof KizloEvent>

export const AnyEvent = z.object({ type: z.string(), data: z.unknown() })
export type AnyEvent = z.infer<typeof AnyEvent>
