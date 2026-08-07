import type { Icon } from "@phosphor-icons/react"

/** A jump-link to an anchored section within a page. */
export interface NavSectionLink {
	/** DOM anchor id of the target section, unique within its page. */
	id: string
	name: string
	icon: Icon
}

/** A settings page: navigable via `path` and drillable into its `sections`. */
export interface NavPage {
	type: "page"
	/** Unique node id used by the sidebar drill stack (e.g. "general/site", "post-types/book"). */
	id: string
	name: string
	path: string
	icon: Icon
	sections: NavSectionLink[]
	/** Kizlo-owned object that is not currently registered; renders an Inactive badge. */
	inactive?: boolean
}

/** A drill-down entry: its child pages replace the root list via the sidebar's sliding panel. */
export interface NavGroup {
	type: "group"
	id: string
	name: string
	icon: Icon
	items: NavPage[]
	/** Route for the inline create (+) action, when the group supports creating items. */
	onCreate?: string
}

export type NavNode = NavPage | NavGroup

/** A labelled block of nav nodes, rendered with a heading and spacing in the sidebar. */
export interface NavBlock {
	label: string
	items: NavNode[]
}

// ====================================================
// TYPES
// ====================================================
