import type { PostStatus } from "../post/schema"
import type { WPK_Post } from "../post/types"

/** Every status WordPress can report for a post-type entry, read from the generated contract. */
export type WPK_PostStatus = WPK_Post["status"]

/**
 * Narrow a WordPress status to the public set the API exposes. Trashed entries, auto-drafts, preview
 * revisions, and the privacy-request statuses are never readable through a procedure, so they read as
 * `draft` — the closest public equivalent — rather than widening the published shape.
 */
export function publicPostStatus(status: WPK_PostStatus): PostStatus {
	switch (status) {
		case "publish":
		case "future":
		case "draft":
		case "pending":
		case "private":
			return status
		default:
			return "draft"
	}
}
