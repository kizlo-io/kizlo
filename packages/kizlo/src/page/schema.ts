import { arrayable, lenient, Metadata, NumberLike } from "@kizlo/shared"
import z from "zod/v4"
import { Seo } from "../seo/schema"
import { IdentifierInput, ListMetadata, ListOrder, Media } from "../shared/schema"
import { WP_PAGE_ORDER_BYES, WP_PAGE_STATUSES } from "../wordpress/page/types"

export const PageStatus = z.enum(WP_PAGE_STATUSES).exclude(["trash"])
export type PageStatus = z.infer<typeof PageStatus>

// ====================================================
// PAGE
// ====================================================

export const PageAuthorRef = z.object({
	id: z.number(),
	name: z.string(),
	slug: z.string(),
	avatar: Media.nullable(),
})
export type PageAuthorRef = z.infer<typeof PageAuthorRef>

export const Page = z.object({
	id: z.number(),
	slug: z.string(),
	url: z.string().nullable(),
	parent: z.number().nullable(),
	menuOrder: z.number(),
	template: z.string(),
	title: z.string().nullable(),
	content: z.string().nullable(),
	excerpt: z.string().nullable(),
	commentsEnabled: z.boolean(),
	protected: z.boolean(),
	preview: z.boolean(),
	status: PageStatus,
	author: PageAuthorRef.nullable(),
	featuredMedia: Media.nullable(),
	seo: Seo.nullable(),
	createdAt: z.number(),
	updatedAt: z.number(),
	meta: Metadata,
})
export type Page = z.output<typeof Page>

// ====================================================
// RETRIEVE
// ====================================================

export const RetrievePageInput = z.object({
	identifier: IdentifierInput,
	password: z.string().optional(),
	previewToken: z.string().optional(),
})
export type RetrievePageInput = z.input<typeof RetrievePageInput>

// ====================================================
// LIST
// ====================================================

export const PageList = z.object({ items: z.array(Page), meta: ListMetadata })
export type PageList = z.output<typeof PageList>

export const PageOrderBy = z.enum(WP_PAGE_ORDER_BYES)
export type PageOrderBy = z.infer<typeof PageOrderBy>

export const PAGE_SEARCH_COLUMNS = ["post_title", "post_content", "post_excerpt"] as const
export const PageSearchColumn = z.enum(PAGE_SEARCH_COLUMNS)
export type PageSearchColumn = z.infer<typeof PageSearchColumn>

export const ListPageInput = z.object({
	page: NumberLike.pipe(z.number().int().min(1)).catch(1).optional(),
	perPage: lenient(NumberLike.pipe(z.number().int().min(1).max(100))),
	search: lenient(z.string()),
	after: lenient(z.string()),
	before: lenient(z.string()),
	modifiedAfter: lenient(z.string()),
	modifiedBefore: lenient(z.string()),
	author: lenient(arrayable(NumberLike)),
	authorExclude: lenient(arrayable(NumberLike)),
	exclude: lenient(arrayable(NumberLike)),
	include: lenient(arrayable(NumberLike)),
	offset: lenient(NumberLike.pipe(z.number().int().min(0))),
	order: lenient(ListOrder),
	orderby: lenient(PageOrderBy),
	searchColumns: lenient(z.array(PageSearchColumn)),
	slug: lenient(arrayable(z.string())),
	parent: lenient(arrayable(NumberLike)),
	parentExclude: lenient(arrayable(NumberLike)),
	menuOrder: lenient(NumberLike),
})
export type ListPageInputIn = z.input<typeof ListPageInput>
export type ListPageInputOut = z.output<typeof ListPageInput>
