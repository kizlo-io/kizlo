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

/** A settings page: navigable via `path` and drillable into its sections. */
export interface NavPage {
	type: "page"
	/** Sidebar drill-stack node id, mirrors the route (e.g. "post-types/book"). */
	id: string
	name: string
	path: string
	/** Icon name. */
	icon: string
	/** Kizlo-owned object that is not currently registered; renders an Inactive badge. */
	inactive?: boolean
	sections: NavSection[]
	/** Delete-card copy. Non-null only for Kizlo-owned, registered objects. */
	delete?: NavDelete | null
}

/** A drill-down entry: its child pages replace the root list via the sliding panel. */
export interface NavDrillGroup {
	type: "group"
	id: string
	name: string
	/** Icon name. */
	icon: string
	/** Route for the inline create (+) action. */
	onCreate?: string
	items: NavPage[]
}

export type NavNode = NavPage | NavDrillGroup

/** A labelled block of nav nodes, rendered with a heading and spacing in the sidebar. */
export interface NavBlock {
	label: string
	items: NavNode[]
}
