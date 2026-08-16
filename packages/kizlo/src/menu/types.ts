import type { WP_EndpointData, WP_EndpointInput } from "../wordpress"

/** A menu item, exactly as the project's generated WordPress client describes it. */
export type WPK_MenuItem = WP_EndpointData<"menuItems.retrieve">

/** What `GET /wp/v2/menu-items` accepts, so a filter can only drift by the route itself changing. */
export type WPK_MenuItemListInput = WP_EndpointInput<"menuItems.list">
