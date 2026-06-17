import { stringifiedMetaRecord } from "@kizlo/shared"
import type { WP_MenuItem, WP_MenuItemListInput } from "../wordpress"
import type { ListMenuInputOut, MenuGroupItem } from "./schema"

export function deserializeListMenuInput(input?: ListMenuInputOut): WP_MenuItemListInput {
	return {
		context: "edit",
		after: input?.after,
		before: input?.before,
		exclude: input?.exclude,
		include: input?.include,
		menu_order: input?.menuOrder,
		menus: input?.menus,
		menus_exclude: input?.menusExclude,
		offset: input?.offset,
		order: input?.order,
		orderby: input?.orderby,
		page: input?.page,
		per_page: input?.perPage,
		search: input?.search,
		slug: input?.slug,
		tax_relation: input?.taxRelation,
		search_columns: input?.searchColumns,
		status: "publish",
	}
}

export function extractSlugFromUrl(url: string): string {
	if (!url || url.trim() === "") return "/"

	const trimmed = url.trim()

	// Extract pathname part (works for both full URLs and paths)
	let pathname: string

	if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
		try {
			pathname = new URL(trimmed).pathname
		} catch {
			pathname = trimmed
		}
	} else {
		pathname = trimmed
	}

	// Clean and extract slug
	const cleanPath = pathname.replace(/^\/+|\/+$/g, "") // Remove leading/trailing slashes

	if (!cleanPath) return "/"

	const segments = cleanPath.split("/")
	return segments[segments.length - 1] ?? "/"
}

export function buildMenuGroupItem(wpItem: WP_MenuItem, items: WP_MenuItem[]): MenuGroupItem {
	const children = items
		.filter((item) => item.parent === wpItem.id)
		.sort((a, b) => a.menu_order - b.menu_order)
		.map((child) => buildMenuGroupItem(child, items))

	const href = wpItem.object !== "custom" ? extractSlugFromUrl(wpItem.url) : wpItem.url

	return {
		id: wpItem.id,
		href,
		name: wpItem.title.rendered,
		description: wpItem.description,
		type: wpItem.object as any,
		items: children,
		hasItems: children.length > 0,
		meta: stringifiedMetaRecord(wpItem.meta ?? {}),
	}
}
