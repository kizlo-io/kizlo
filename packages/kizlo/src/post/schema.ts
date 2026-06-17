import { arrayable, BooleanLike, Metadata, NumberLike } from "@kizlo/shared"
import z from "zod/v4"
import { Seo } from "../seo/schema"
import { IdentifierInput, ListMetadata, ListOrder, Media } from "../shared/schema"

export const POST_TYPE_FORMATS = ["standard", "aside", "chat", "gallery", "link", "image", "quote", "status", "video", "audio"] as const
export const PostTypeFormat = z.enum(POST_TYPE_FORMATS)
export type PostTypeFormat = z.infer<typeof PostTypeFormat>

export const POST_STATUSES = ["publish", "future", "draft", "pending", "private"] as const
export const PostStatus = z.enum(POST_STATUSES)
export type PostStatus = z.infer<typeof PostStatus>

export const POST_COMMENT_STATUSES = ["approved", "hold", "spam", "trash"] as const
export const PostCommentStatus = z.enum(POST_COMMENT_STATUSES)
export type PostCommentStatus = z.infer<typeof PostCommentStatus>

export const POST_COMMENT_TYPES = ["comment", "pingback", "trackback"] as const
export const PostCommentType = z.enum(POST_COMMENT_TYPES)
export type PostCommentType = z.infer<typeof PostCommentType>

// ====================================================
// POST
// ====================================================

export const PostAuthorRef = z.object({
	id: z.number(),
	name: z.string(),
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
	title: z.string().nullable(),
	content: z.string().nullable(),
	excerpt: z.string().nullable(),
	commentsEnabled: z.boolean(),
	protected: z.boolean(),
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

export const POST_ORDER_BYES = ["author", "date", "id", "include", "parent", "relevance", "slug", "include_slugs", "title"] as const
export const PostOrderBy = z.enum(POST_ORDER_BYES)
export type PostOrderBy = z.infer<typeof PostOrderBy>

export const ListPostInput = z.object({
	page: NumberLike.optional(),
	perPage: NumberLike.optional(),
	search: z.string().optional(),
	after: z.string().optional(),
	before: z.string().optional(),
	author: arrayable(NumberLike).optional(),
	authorExclude: arrayable(NumberLike).optional(),
	exclude: arrayable(NumberLike).optional(),
	include: arrayable(NumberLike).optional(),
	offset: NumberLike.optional(),
	order: ListOrder.optional(),
	orderby: PostOrderBy.optional(),
	searchColumns: z.array(z.string()).optional(),
	slug: arrayable(z.string()).optional(),
	taxRelation: z.enum(["AND", "OR"]).optional(),
	categories: arrayable(NumberLike).optional(),
	categoriesExclude: arrayable(NumberLike).optional(),
	tags: arrayable(NumberLike).optional(),
	tagsExclude: arrayable(NumberLike).optional(),
	sticky: BooleanLike.optional(),
})
export type ListPostInputIn = z.input<typeof ListPostInput>
export type ListPostInputOut = z.output<typeof ListPostInput>
