export interface WPK_MenuItem {
	id: number
	parent: number
	object: string
	object_id: number
	url: string
	title: { rendered: string }
	description: string
	target: "_blank" | ""
	classes: string[]
	attr_title: string
	xfn: string[]
	menu_order: number
	invalid: boolean
	meta?: Record<string, unknown>
}

export interface WPK_MenuItemListInput extends Record<string, unknown> {
	context?: "view" | "embed" | "edit"
	after?: string
	before?: string
	exclude?: number | number[]
	include?: number | number[]
	menu_order?: number
	menus?: number | number[]
	menus_exclude?: number | number[]
	offset?: number
	order?: "asc" | "desc"
	orderby?: string
	page?: number
	per_page?: number
	search?: string
	slug?: string | string[]
	tax_relation?: "AND" | "OR"
	search_columns?: string[]
	status?: string
}
