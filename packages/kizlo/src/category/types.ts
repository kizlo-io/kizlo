import type { WP_EndpointData } from "../wordpress"

/** A category term, exactly as the project's generated WordPress client describes it. */
export type WPK_Category = WP_EndpointData<"taxonomies.category.retrieve">

/** A category as it appears in a list response — the same term, without the resolved SEO block. */
export type WPK_CategoryListItem = WP_EndpointData<"taxonomies.category.list">[number]
