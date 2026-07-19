import { arrayable, type LiteralUnion, lenient, Metadata, NumberLike } from "@kizlo/shared"
import z from "zod/v4"
import { ListMetadata, ListOrder } from "../shared/schema"
import { WP_MENU_ITEM_ORDER_BYES, WP_MENU_ITEM_TARGETS, WP_MENU_ITEM_TAX_RELATIONS } from "../wordpress/menu/items/types"

export const MENU_TYPES = ["page", "post", "category", "tag", "product", "product_cat", "product_tag", "custom"] as const
export type MenuType = LiteralUnion<(typeof MENU_TYPES)[number], string>
export const MenuType: z.ZodType<MenuType> = z.string()

export const MenuTarget = z.enum(WP_MENU_ITEM_TARGETS)
export type MenuTarget = z.infer<typeof MenuTarget>

export const MenuItem = z.object({
	id: z.number(),
	parent: z.number().nullable(),
	type: MenuType,
	objectId: z.number(),
	href: z.string(),
	name: z.string(),
	description: z.string(),
	target: MenuTarget,
	classes: z.array(z.string()),
	attrTitle: z.string(),
	xfn: z.array(z.string()),
	order: z.number(),
	invalid: z.boolean(),
	meta: Metadata,
})
export type MenuItem = z.output<typeof MenuItem>

export type MenuGroupItem = {
	id: number
	parent: number | null
	type: MenuType
	objectId: number
	href: string
	name: string
	description: string
	target: MenuTarget
	classes: string[]
	attrTitle: string
	xfn: string[]
	order: number
	invalid: boolean
	hasItems: boolean
	meta: Metadata
	items: MenuGroupItem[]
}
export const MenuGroupItem: z.ZodType<MenuGroupItem> = z.lazy(() =>
	MenuItem.extend({
		items: z.array(MenuGroupItem),
		hasItems: z.boolean(),
		meta: Metadata,
	}),
)

export const MenuItemList = z.object({ items: z.array(MenuItem), meta: ListMetadata })
export type MenuItemList = z.output<typeof MenuItemList>

export const MenuGroupItemList = z.object({ items: z.array(MenuGroupItem), meta: ListMetadata })
export type MenuGroupItemList = z.output<typeof MenuGroupItemList>

// ====================================================
// LIST
// ====================================================

export const MenuItemOrderBy = z.enum(WP_MENU_ITEM_ORDER_BYES).exclude(["modified"])
export type MenuItemOrderBy = z.infer<typeof MenuItemOrderBy>

export const MENU_ITEM_SEARCH_COLUMNS = ["post_title", "post_content", "post_excerpt"] as const
export const MenuItemSearchColumn = z.enum(MENU_ITEM_SEARCH_COLUMNS)
export type MenuItemSearchColumn = z.infer<typeof MenuItemSearchColumn>

export const ListMenuInput = z.object({
	page: NumberLike.pipe(z.number().int().min(1)).catch(1).optional(),
	perPage: lenient(NumberLike.pipe(z.number().int().min(1).max(100))),
	search: lenient(z.string()),
	after: lenient(z.string()),
	before: lenient(z.string()),
	exclude: lenient(arrayable(NumberLike)),
	include: lenient(arrayable(NumberLike)),
	offset: lenient(NumberLike.pipe(z.number().int().min(0))),
	order: lenient(ListOrder),
	orderby: lenient(MenuItemOrderBy),
	searchColumns: lenient(z.array(MenuItemSearchColumn)),
	slug: lenient(arrayable(z.string())),
	taxRelation: lenient(z.enum(WP_MENU_ITEM_TAX_RELATIONS)),
	menus: lenient(arrayable(NumberLike)),
	menusExclude: lenient(arrayable(NumberLike)),
	menuOrder: lenient(NumberLike.pipe(z.number().int())),
})
export type ListMenuInputIn = z.input<typeof ListMenuInput>
export type ListMenuInputOut = z.output<typeof ListMenuInput>
