import type { WP_EndpointData } from "../wordpress"

/** A post entry, exactly as the project's generated WordPress client describes it. */
export type WPK_Post = WP_EndpointData<"postTypes.post.retrieve">

/** A post as it appears in a list response — the same entry, without the resolved SEO block. */
export type WPK_PostListItem = WP_EndpointData<"postTypes.post.list">[number]
