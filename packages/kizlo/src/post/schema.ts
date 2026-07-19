import { arrayable, BooleanLike, lenient, Metadata, NumberLike } from "@kizlo/shared"
import z from "zod/v4"
import { Seo } from "../seo/schema"
import { IdentifierInput, ListMetadata, ListOrder, Media } from "../shared/schema"
import { WP_POST_FORMATS, WP_POST_ORDER_BYES, WP_POST_STATUSES, WP_POST_TAX_RELATIONS } from "../wordpress/post/types"

export const PostTypeFormat = z.enum(WP_POST_FORMATS)
export type PostTypeFormat = z.infer<typeof PostTypeFormat>

export const PostStatus = z.enum(WP_POST_STATUSES).exclude(["trash"])
export type PostStatus = z.infer<typeof PostStatus>

// ====================================================
// POST
// ====================================================

export const PostAuthorRef = z.object({
	id: z.number(),
	name: z.string(),
	slug: z.string(),
	avatar: Media.nullable(),
})
export type PostAuthorRef = z.infer<typeof PostAuthorRef>

export const PostCategoryRef = z.object({
	id: z.number(),
	name: z.string(),
	slug: z.string(),
})
export type PostCategoryRef = z.infer<typeof PostCategoryRef>

export const PostTagRef = z.object({
	id: z.number(),
	name: z.string(),
	slug: z.string(),
})
export type PostTagRef = z.infer<typeof PostTagRef>

export const Post = z.object({
	id: z.number(),
	slug: z.string(),
	url: z.string().nullable(),
	parent: z.number().nullable(),
	title: z.string().nullable(),
	content: z.string().nullable(),
	excerpt: z.string().nullable(),
	commentsEnabled: z.boolean(),
	protected: z.boolean(),
	preview: z.boolean(),
	status: PostStatus,
	format: PostTypeFormat,
	sticky: z.boolean(),
	author: PostAuthorRef.nullable(),
	featuredMedia: Media.nullable(),
	categories: z.array(PostCategoryRef),
	tags: z.array(PostTagRef),
	seo: Seo.nullable(),
	createdAt: z.number(),
	updatedAt: z.number(),
	meta: Metadata,
})
export type Post = z.output<typeof Post>

// ====================================================
// RETRIEVE
// ====================================================

export const RetrievePostInput = z.object({
	identifier: IdentifierInput,
	password: z.string().optional(),
	previewToken: z.string().optional(),
})
export type RetrievePostInput = z.input<typeof RetrievePostInput>

// ====================================================
// LIST
// ====================================================

export const PostList = z.object({ items: z.array(Post), meta: ListMetadata })
export type PostList = z.output<typeof PostList>

export const PostOrderBy = z.enum(WP_POST_ORDER_BYES)
export type PostOrderBy = z.infer<typeof PostOrderBy>

export const POST_SEARCH_COLUMNS = ["post_title", "post_content", "post_excerpt"] as const
export const PostSearchColumn = z.enum(POST_SEARCH_COLUMNS)
export type PostSearchColumn = z.infer<typeof PostSearchColumn>

export const ListPostInput = z.object({
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
	orderby: lenient(PostOrderBy),
	searchColumns: lenient(z.array(PostSearchColumn)),
	slug: lenient(arrayable(z.string())),
	taxRelation: lenient(z.enum(WP_POST_TAX_RELATIONS)),
	categories: lenient(arrayable(NumberLike)),
	categoriesExclude: lenient(arrayable(NumberLike)),
	tags: lenient(arrayable(NumberLike)),
	tagsExclude: lenient(arrayable(NumberLike)),
	sticky: lenient(BooleanLike),
})
export type ListPostInputIn = z.input<typeof ListPostInput>
export type ListPostInputOut = z.output<typeof ListPostInput>
