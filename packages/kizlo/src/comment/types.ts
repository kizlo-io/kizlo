import type { WP_EndpointData } from "../wordpress"

/**
 * A comment, exactly as the project's generated WordPress client describes it.
 *
 * Every comment operation resolves to this one shape, whoever owns the route: the reads WordPress
 * serves, and the submission Kizlo serves, all end at the same controller in the same context and
 * pass through the same `rest_prepare_comment` filter. So one alias covers the three call sites
 * rather than each restating what it expects back.
 */
export type WPK_Comment = WP_EndpointData<"comments.retrieve">
