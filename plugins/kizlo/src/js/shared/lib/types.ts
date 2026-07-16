import type { Icon } from "@phosphor-icons/react"

export interface NavLeaf {
	name: string
	path: string
	icon: Icon
}

export interface NavLink extends NavLeaf {
	type: "link"
}

/** A drill-down entry: its children replace the root list via the sidebar's sliding panel. */
export interface NavGroup {
	type: "group"
	id: string
	name: string
	icon: Icon
	items: NavLeaf[]
}

export type NavNode = NavLink | NavGroup

/** A labelled block of nav nodes, rendered with a heading and spacing in the sidebar. */
export interface NavSection {
	label: string
	items: NavNode[]
}

// ====================================================
// TYPES
// ====================================================
