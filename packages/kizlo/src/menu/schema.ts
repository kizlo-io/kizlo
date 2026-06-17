import { arrayable, type LiteralUnion, Metadata, NumberLike } from "@kizlo/shared"
import z from "zod/v4"
import { ListMetadata, ListOrder } from "../shared/schema"

export const MENU_TYPES = ["page", "post", "category", "product", "product_cat", "product_tag", "custom"] as const
export const MenuType = z.enum(MENU_TYPES)
export type MenuType = LiteralUnion<z.infer<typeof MenuType>, string>

export const MenuItem = z.object({
	id: z.number(),
	href: z.string(),
	name: z.string(),
	type: MenuType,
	description: z.string(),
	meta: Metadata,
})
export type MenuItem = z.output<typeof MenuItem>

export interface MenuGroupItem {
	id: number
	href: string
	name: string
	type: MenuType
	description: string
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

export const MENU_ITEM_ORDER_BYES = [
	"author",
	"date",
	"id",
	"include",
	"parent",
	"relevance",
	"slug",
	"include_slugs",
	"title",
	"menu_order",
] as const
export const MenuItemOrderBy = z.enum(MENU_ITEM_ORDER_BYES)
export type MenuItemOrderBy = z.infer<typeof MenuItemOrderBy>

export const ListMenuInput = z.object({
	page: NumberLike.optional(),
	perPage: NumberLike.optional(),
	search: z.string().optional(),
	after: z.string().optional(),
	before: z.string().optional(),
	exclude: arrayable(NumberLike).optional(),
	include: arrayable(NumberLike).optional(),
	offset: NumberLike.optional(),
	order: ListOrder.optional(),
	orderby: MenuItemOrderBy.optional(),
	searchColumns: z.array(z.string()).optional(),
	slug: arrayable(z.string()).optional(),
	taxRelation: z.enum(["AND", "OR"]).optional(),
	menus: arrayable(NumberLike).optional(),
	menusExclude: arrayable(NumberLike).optional(),
	menuOrder: NumberLike.optional(),
})
export type ListMenuInputIn = z.input<typeof ListMenuInput>
export type ListMenuInputOut = z.output<typeof ListMenuInput>
