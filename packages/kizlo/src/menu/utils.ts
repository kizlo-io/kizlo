import { stringifiedMetaRecord } from "@kizlo/shared"
import type { WP_MenuItem, WP_MenuItemListInput } from "../wordpress"
import type { ListMenuInputOut, MenuGroupItem } from "./schema"

export function deserializeListMenuInput(input?: ListMenuInputOut): WP_MenuItemListInput {
	// Drop an orderby WP would reject for a missing companion param, so the list degrades instead of 400ing.
	const orderby =
		(input?.orderby === "relevance" && !input?.search) ||
		(input?.orderby === "include" && input?.include === undefined) ||
		(input?.orderby === "include_slugs" && input?.slug === undefined)
			? undefined
			: input?.orderby

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
		orderby,
		page: input?.page,
		per_page: input?.perPage,
		search: input?.search,
		slug: input?.slug,
		tax_relation: input?.taxRelation,
		search_columns: input?.searchColumns,
		status: "publish",
	}
}

/**
 * The `href` a headless frontend links to. WP builds a non-custom item's `url` as an absolute same-site
 * URL, so we return its full pathname; a custom item's `url` is passed through as authored (a relative
 * path, or an absolute URL for external links). Both yield the same value for the same internal path.
 */
export function extractPath(url: string, isCustom: boolean): string {
	if (!url || url.trim() === "") return "/"

	const trimmed = url.trim()

	// Custom links are authored verbatim and may point off-site, so never strip their host.
	if (isCustom) return trimmed

	if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
		try {
			return new URL(trimmed).pathname || "/"
		} catch {
			return trimmed
		}
	}

	return trimmed
}

export function buildMenuGroupItem(wpItem: WP_MenuItem, items: WP_MenuItem[]): MenuGroupItem {
	const children = items
		.filter((item) => item.parent === wpItem.id)
		.sort((a, b) => a.menu_order - b.menu_order)
		.map((child) => buildMenuGroupItem(child, items))

	return {
		id: wpItem.id,
		parent: wpItem.parent === 0 ? null : wpItem.parent,
		type: wpItem.object,
		objectId: wpItem.object_id,
		href: extractPath(wpItem.url, wpItem.object === "custom"),
		name: wpItem.title.rendered,
		description: wpItem.description,
		target: wpItem.target,
		// WP stores "no classes" as [""], so drop empty entries.
		classes: wpItem.classes.filter(Boolean),
		attrTitle: wpItem.attr_title,
		xfn: wpItem.xfn.filter(Boolean),
		order: wpItem.menu_order,
		invalid: wpItem.invalid,
		items: children,
		hasItems: children.length > 0,
		meta: stringifiedMetaRecord(wpItem.meta ?? {}),
	}
}
