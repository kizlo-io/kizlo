// ====================================================
// SETTINGS NAVIGATION — served shape (window.kizlo.nav)
// ====================================================
//
// PHP (SettingsNav) is the single source of truth for the settings navigation:
// structure, visibility gates, and per-type section copy. The client is a pure
// renderer — it only resolves icon NAMES to components (resolveIcon) and renders
// the served copy. Keep these interfaces in sync with the PHP shape; the zod
// guard in shared/lib/nav.ts fails loudly on drift.

/** A section's heading + description, plus its sidebar jump-link icon name. Each section is one sidebar menu item. */
export interface NavSection {
	/** DOM anchor id, unique within its page. */
	id: string
	title: string
	/** HTML string, rendered sanitized. Server-templated with the object name. */
	desc?: string
	/** Icon name (sidebar jump-link). */
	icon: string
}

/** Copy for a page's delete card, server-templated with the object name. */
export interface NavDelete {
	/** Heads the delete card and its trigger button, e.g. "Delete Books". */
	label: string
	/** Explains the action. Server-templated with the object name. */
	desc: string
}

/**
 * How a node with children reveals them in the sidebar. `drill` (default) slides
 * the children in over the parent list; `collapse` expands them inline beneath the
 * parent, keeping the parent list visible.
 */
export type NavVariant = "drill" | "collapse"

/** A settings page: navigable via `path` and drillable into its sections. */
export interface NavPage {
	type: "page"
	/** Sidebar drill-stack node id, mirrors the route (e.g. "post-types/book"). */
	id: string
	name: string
	path: string
	/** Icon name. */
	icon: string
	/** How this page's sections are revealed in the sidebar. Defaults to `drill`. */
	variant?: NavVariant
	/** Kizlo-owned object that is not currently registered; renders an Inactive badge. */
	inactive?: boolean
	sections: NavSection[]
	/** Delete-card copy. Non-null only for Kizlo-owned, registered objects. */
	delete?: NavDelete | null
}

/** An inline "create" action on a group: its route plus the label shown for it. */
export interface NavCreate {
	/** Route for the create page, e.g. "/post-types/new". */
	path: string
	/** Label for the action, e.g. "New post type". Shown in the command menu. */
	label: string
}

/** A parent entry whose child pages are revealed by drilling or inline collapse. */
export interface NavDrillGroup {
	type: "group"
	id: string
	name: string
	/** Icon name. */
	icon: string
	/** How this group's child pages are revealed in the sidebar. Defaults to `drill`. */
	variant?: NavVariant
	/** Inline create (+) action: the sidebar "+" button and command-menu entry. */
	create?: NavCreate
	items: NavPage[]
}

export type NavNode = NavPage | NavDrillGroup

/** A labelled block of nav nodes, rendered with a heading and spacing in the sidebar. */
export interface NavBlock {
	label: string
	items: NavNode[]
}
