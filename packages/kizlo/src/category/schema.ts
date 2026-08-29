import { arrayable, BooleanLike, lenient, Metadata, NumberLike } from "@kizlo/shared"
import z from "zod/v4"
import { Seo } from "../seo/schema"
import { customFieldsSchema, IdentifierInput, ListMetadata, ListOrder } from "../shared/schema"
import type { WP_CustomFields } from "../wordpress"

const WP_CATEGORY_ORDER_BYS = ["id", "include", "name", "slug", "include_slugs", "term_group", "description", "count"] as const

// ====================================================
// CATEGORY
// ====================================================

export type CategoryCustomFields = WP_CustomFields<"taxonomies.category">

export const CategoryCustomFieldsSchema: z.ZodType<CategoryCustomFields, CategoryCustomFields> = customFieldsSchema<CategoryCustomFields>()

export const Category = z.object({
	id: z.number(),
	name: z.string(),
	slug: z.string(),
	url: z.string().nullable(),
	description: z.string().nullable(),
	parent: z.number().nullable(),
	postCount: z.number(),
	seo: Seo.nullable(),
	custom: CategoryCustomFieldsSchema,
	meta: Metadata,
})
export type Category = Omit<z.output<typeof Category>, "custom"> & { custom: CategoryCustomFields }

// ====================================================
// RETRIEVE
// ====================================================

export const RetrieveCategoryInput = z.object({
	identifier: IdentifierInput,
})
export type RetrieveCategoryInput = z.input<typeof RetrieveCategoryInput>

// ====================================================
// LIST
// ====================================================

export const CategoryList = z.object({ items: z.array(Category), meta: ListMetadata })
export type CategoryList = Omit<z.output<typeof CategoryList>, "items"> & { items: Category[] }

export const CategoryOrderBy = z.enum(WP_CATEGORY_ORDER_BYS)
export type CategoryOrderBy = z.infer<typeof CategoryOrderBy>

export const ListCategoryInput = z.object({
	page: NumberLike.pipe(z.number().int().min(1)).catch(1).optional(),
	perPage: lenient(NumberLike.pipe(z.number().int().min(1).max(100))),
	search: lenient(z.string()),
	exclude: lenient(arrayable(NumberLike)),
	include: lenient(arrayable(NumberLike)),
	order: lenient(ListOrder),
	orderBy: lenient(CategoryOrderBy),
	hideEmpty: lenient(BooleanLike),
	parent: lenient(NumberLike),
	post: lenient(NumberLike),
	slug: lenient(arrayable(z.string())),
})
export type ListCategoryInputIn = z.input<typeof ListCategoryInput>
export type ListCategoryInputOut = z.output<typeof ListCategoryInput>
