import type { WP_EndpointData } from "../wordpress"

/**
 * A comment, exactly as the project's generated WordPress client describes it. The `kizlo`
 * enrichment block the plugin adds rides on the core `wp/v2/comments` responses too, so the read
 * procedures — whose routes core owns, and which therefore have no generated operation — share it.
 */
export type WPK_Comment = WP_EndpointData<"comments.create">
