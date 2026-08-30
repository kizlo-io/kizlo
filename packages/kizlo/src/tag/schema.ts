import { arrayable, BooleanLike, lenient, Metadata, NumberLike } from "@kizlo/shared"
import z from "zod/v4"
import { Seo } from "../seo/schema"
import { customFieldsSchema, IdentifierInput, ListMetadata, ListOrder } from "../shared/schema"
import type { WP_CustomFields } from "../wordpress"

const WP_TAG_ORDER_BYS = ["id", "include", "name", "slug", "include_slugs", "term_group", "description", "count"] as const

// ====================================================
// TAG
// ====================================================

export type TagCustomFields = WP_CustomFields<"taxonomies.postTag">

export const TagCustomFieldsSchema: z.ZodType<TagCustomFields, TagCustomFields> = customFieldsSchema<TagCustomFields>()

export const Tag = z.object({
	id: z.number(),
	name: z.string(),
	slug: z.string(),
	url: z.string().nullable(),
	description: z.string().nullable(),
	postCount: z.number(),
	seo: Seo.nullable(),
	custom: TagCustomFieldsSchema,
	meta: Metadata,
})
export type Tag = Omit<z.output<typeof Tag>, "custom"> & { custom: TagCustomFields }

// ====================================================
// RETRIEVE
// ====================================================

export const RetrieveTagInput = z.object({
	identifier: IdentifierInput,
})
export type RetrieveTagInput = z.input<typeof RetrieveTagInput>

// ====================================================
// LIST
// ====================================================

export const TagList = z.object({ items: z.array(Tag), meta: ListMetadata })
export type TagList = Omit<z.output<typeof TagList>, "items"> & { items: Tag[] }

export const TagOrderBy = z.enum(WP_TAG_ORDER_BYS)
export type TagOrderBy = z.infer<typeof TagOrderBy>

export const ListTagInput = z.object({
	page: NumberLike.pipe(z.number().int().min(1)).catch(1).optional(),
	perPage: lenient(NumberLike.pipe(z.number().int().min(1).max(100))),
	search: lenient(z.string()),
	exclude: lenient(arrayable(NumberLike)),
	include: lenient(arrayable(NumberLike)),
	order: lenient(ListOrder),
	orderBy: lenient(TagOrderBy),
	hideEmpty: lenient(BooleanLike),
	post: lenient(NumberLike),
	slug: lenient(arrayable(z.string())),
})
export type ListTagInputIn = z.input<typeof ListTagInput>
export type ListTagInputOut = z.output<typeof ListTagInput>
