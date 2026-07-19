import { arrayable, BooleanLike, lenient, Metadata, NumberLike } from "@kizlo/shared"
import z from "zod/v4"
import { Seo } from "../seo/schema"
import { IdentifierInput, ListMetadata, ListOrder } from "../shared/schema"
import { WP_CATEGORY_ORDER_BYS } from "../wordpress/category/types"

// ====================================================
// CATEGORY
// ====================================================

export const Category = z.object({
	id: z.number(),
	name: z.string(),
	slug: z.string(),
	url: z.string().nullable(),
	description: z.string().nullable(),
	parent: z.number().nullable(),
	postCount: z.number(),
	seo: Seo.nullable(),
	meta: Metadata,
})
export type Category = z.output<typeof Category>

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
export type CategoryList = z.output<typeof CategoryList>

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
