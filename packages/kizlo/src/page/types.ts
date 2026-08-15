import type { WP_EndpointData } from "../wordpress"

/** A page entry, exactly as the project's generated WordPress client describes it. */
export type WPK_Page = WP_EndpointData<"postTypes.page.retrieve">

/** A page as it appears in a list response — the same entry, without the resolved SEO block. */
export type WPK_PageListItem = WP_EndpointData<"postTypes.page.list">[number]
