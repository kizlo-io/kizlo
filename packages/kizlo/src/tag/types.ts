import type { WP_EndpointData } from "../wordpress"

/** A tag term, exactly as the project's generated WordPress client describes it. */
export type WPK_Tag = WP_EndpointData<"taxonomies.postTag.retrieve">

/** A tag as it appears in a list response — the same term, without the resolved SEO block. */
export type WPK_TagListItem = WP_EndpointData<"taxonomies.postTag.list">[number]
