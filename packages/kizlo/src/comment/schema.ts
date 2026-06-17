import { arrayable, NumberLike } from "@kizlo/shared"
import z from "zod/v4"
import { ListMetadata, ListOrder, Media } from "../shared/schema"

// ====================================================
// COMMENT
// ====================================================

export const CommentAuthorRef = z.object({
	id: z.number(),
	name: z.string(),
	avatar: Media.nullable(),
})
export type CommentAuthorRef = z.infer<typeof CommentAuthorRef>

export const CommentPostRef = z.object({
	id: z.number(),
	slug: z.string(),
	title: z.string(),
	image: Media.nullable(),
})
export type CommentPostRef = z.infer<typeof CommentPostRef>

export const Comment = z.object({
	id: z.number(),
	parentId: z.number(),
	author: CommentAuthorRef.nullable(),
	content: z.string(),
	post: CommentPostRef,
	replyCount: z.number(),
	postedAt: z.number(),
	isApproved: z.boolean(),
})
export type Comment = z.infer<typeof Comment>

// ====================================================
// RETRIEVE
// ====================================================

export const GetCommentInput = z.object({
	id: NumberLike,
	password: z.string().optional(),
})
export type GetCommentInput = z.input<typeof GetCommentInput>
export type GetCommentInputOut = z.output<typeof GetCommentInput>

// ====================================================
// LIST
// ====================================================

export const COMMENT_LIST_ORDER_BYS = ["date", "id", "include", "post", "parent"] as const
export const CommentListOrderBy = z.enum(COMMENT_LIST_ORDER_BYS)
export type CommentListOrderBy = z.infer<typeof CommentListOrderBy>

export const ListCommentInput = z.object({
	page: NumberLike.optional(),
	perPage: NumberLike.optional(),
	search: z.string().optional(),
	after: z.iso.datetime().optional(),
	author: arrayable(NumberLike).optional(),
	authorExclude: arrayable(NumberLike).optional(),
	before: z.iso.datetime().optional(),
	exclude: arrayable(NumberLike).optional(),
	include: arrayable(NumberLike).optional(),
	offset: NumberLike.optional(),
	order: ListOrder.optional(),
	orderby: CommentListOrderBy.optional(),
	parent: arrayable(NumberLike).optional(),
	parentExclude: arrayable(NumberLike).optional(),
	post: arrayable(NumberLike).optional(),
	password: z.string().optional(),
})
export type ListCommentInput = z.input<typeof ListCommentInput>
export type ListCommentInputOut = z.output<typeof ListCommentInput>

export const CommentList = z.object({ items: z.array(Comment), meta: ListMetadata })
export type CommentList = z.infer<typeof CommentList>

// ====================================================
// SUBMIT
// ====================================================

export const SubmitCommentInput = z.object({
	postId: z.number(),
	parentId: z.number().optional(),
	content: z.string(),
	authorEmail: z.email().optional(),
	authorName: z.string().optional(),
	authorUrl: z.url().optional(),
	captchaToken: z.string().optional(),
})
export type SubmitCommentInput = z.infer<typeof SubmitCommentInput>
