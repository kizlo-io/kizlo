import z from "zod/v4"
import { KizloError } from "../../../shared/error"
import { createIntegration } from "../../../shared/integration"
import { createEventHandler } from "../../../webhook"
import {
	POST_EVENT_TYPES,
	PostEventData,
	SETTINGS_EVENT_TYPES,
	SETTINGS_INDEXED_EVENT_TYPES,
	type SettingsEventType,
	SettingsIndexedEventData,
	SettingsSimpleEventData,
	TERM_EVENT_TYPES,
	TermDependencies,
	TermEventData,
} from "../../../webhook/schema"
import { getCacheContext, purgeCache, revalidateTags } from "./cache"
import { validateTags } from "./cache-policy"

export type RevalidationPostData = z.output<typeof PostEventData> & { affected_terms: TermDependencies }
export type RevalidationTermData = z.output<typeof TermEventData> & { affected_terms: TermDependencies }
export interface RevalidationPostRule {
	resourceTag(id: number): string
	collectionTags?(data: RevalidationPostData): readonly string[]
}
export interface RevalidationTaxonomyRule {
	resourceTag(id: number): string
	collectionTags?(id: number, data: RevalidationTermData): readonly string[]
}
export type RevalidationSettingsEvent<K extends SettingsEventType> = {
	type: K
	data: K extends (typeof SETTINGS_INDEXED_EVENT_TYPES)[number] ? { key: string } : null
}
export interface RevalidatorOptions {
	postTypes?: Record<string, RevalidationPostRule>
	taxonomies?: Record<string, RevalidationTaxonomyRule>
	settings?: "purge" | { [K in SettingsEventType]?: (event: RevalidationSettingsEvent<K>) => readonly string[] }
}

const rule = z
	.object({
		resourceTag: z.custom<(...args: never[]) => unknown>((value) => typeof value === "function"),
		collectionTags: z.custom((value) => typeof value === "function").optional(),
	})
	.strict()
const rules = z.record(z.string().regex(/^[a-zA-Z0-9_-]+$/), rule)
const optionsSchema = z
	.object({
		postTypes: rules.optional(),
		taxonomies: rules.optional(),
		settings: z
			.union([
				z.literal("purge"),
				z.partialRecord(
					z.enum(SETTINGS_EVENT_TYPES),
					z.custom((value) => typeof value === "function"),
				),
			])
			.optional(),
	})
	.strict()

/** Optional content-change rules; does not install a response caching policy. */
export function revalidator(options: RevalidatorOptions = {}) {
	optionsSchema.parse(options)
	const purgeSettings = options.settings === "purge"
	const settings = typeof options.settings === "object" ? options.settings : {}
	const postSchema = z.unknown().transform((data, ctx) => {
		const configured =
			data !== null &&
			typeof data === "object" &&
			"post_type" in data &&
			typeof data.post_type === "string" &&
			Object.hasOwn(options.postTypes ?? {}, data.post_type)
		// Unconfigured legacy content does not impose a newer plugin contract.
		if (!configured) {
			if (
				Object.keys(options.postTypes ?? {}).length &&
				(data === null ||
					typeof data !== "object" ||
					!("post_type" in data) ||
					typeof data.post_type !== "string" ||
					!data.post_type.length)
			) {
				ctx.addIssue({ code: "custom", message: "A post_type is required to select configured rules" })
				return z.NEVER
			}
			return data
		}
		const result = PostEventData.extend({ affected_terms: TermDependencies }).safeParse(data)
		if (!result.success) {
			ctx.addIssue({ code: "custom", message: "Complete affected_terms is required for configured post types" })
			return z.NEVER
		}
		return result.data
	})
	const termSchema = z.unknown().transform((data, ctx) => {
		const configured =
			data !== null &&
			typeof data === "object" &&
			"taxonomy" in data &&
			typeof data.taxonomy === "string" &&
			Object.hasOwn(options.taxonomies ?? {}, data.taxonomy)
		if (!configured) {
			if (
				Object.keys(options.taxonomies ?? {}).length &&
				(data === null || typeof data !== "object" || !("taxonomy" in data) || typeof data.taxonomy !== "string" || !data.taxonomy.length)
			) {
				ctx.addIssue({ code: "custom", message: "A taxonomy is required to select configured rules" })
				return z.NEVER
			}
			return data
		}
		const result = TermEventData.extend({ affected_terms: TermDependencies }).safeParse(data)
		if (!result.success) {
			ctx.addIssue({ code: "custom", message: "Complete affected_terms is required for configured taxonomies" })
			return z.NEVER
		}
		return result.data
	})
	const events = [
		{ types: [...POST_EVENT_TYPES], data: postSchema },
		{ types: [...TERM_EVENT_TYPES], data: termSchema },
		...(purgeSettings ? SETTINGS_EVENT_TYPES : Object.keys(settings)).map((type) => ({
			types: [type],
			data: SETTINGS_INDEXED_EVENT_TYPES.includes(type as never) ? SettingsIndexedEventData : SettingsSimpleEventData,
		})),
	]
	const handler = createEventHandler(events, async (event, context) => {
		if (!event) return
		const selected: string[] = []
		const addResource = (tag: string) => {
			selected.push(...validateTags([tag]))
		}
		const addCollection = (tags: readonly string[]) => {
			selected.push(...validateTags(tags))
		}
		if (POST_EVENT_TYPES.includes(event.type as never)) {
			const data = event.data as RevalidationPostData | null
			const rule =
				data && typeof data.post_type === "string" && Object.hasOwn(options.postTypes ?? {}, data.post_type)
					? options.postTypes?.[data.post_type]
					: undefined
			if (!rule || !data) return
			addResource(rule.resourceTag(data.post_id))
			if (rule.collectionTags) addCollection(rule.collectionTags(data))
		} else if (TERM_EVENT_TYPES.includes(event.type as never)) {
			const data = event.data as RevalidationTermData | null
			const rule =
				data && typeof data.taxonomy === "string" && Object.hasOwn(options.taxonomies ?? {}, data.taxonomy)
					? options.taxonomies?.[data.taxonomy]
					: undefined
			if (!rule || !data) return
			for (const id of new Set([data.term_id, ...(data.affected_terms[data.taxonomy] ?? [])])) {
				addResource(rule.resourceTag(id))
				if (rule.collectionTags) addCollection(rule.collectionTags(id, data))
			}
		} else {
			if (!purgeSettings) {
				const setting = settings[event.type as SettingsEventType]
				if (!setting) return
				addCollection(setting(event as never))
			}
		}
		const purge = purgeSettings && SETTINGS_EVENT_TYPES.includes(event.type as SettingsEventType)
		if (!purge && !selected.length) return
		const active = getCacheContext()
		const expected = new URL(context.config.baseUrl ?? "").origin
		if (active.url.origin !== expected || !context.request || new URL(context.request.url).origin !== expected) {
			throw new KizloError("UNPROCESSABLE_CONTENT", {
				message: "Revalidation webhook must use the configured public origin and cache-owning Worker entrypoint.",
			})
		}
		try {
			if (purge) await purgeCache()
			else await revalidateTags(selected)
		} catch (error) {
			if (error !== null && typeof error === "object" && "status" in error && error.status === 429)
				throw new KizloError("TOO_MANY_REQUESTS", { cause: error })
			throw error
		}
	})
	return createIntegration({ id: "revalidator", events: [{ ...handler, failureMode: "retry" as const }] })
}
