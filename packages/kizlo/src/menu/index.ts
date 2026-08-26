import { stringifiedMetaRecord } from "@kizlo/shared"
import { createProcedure } from "../shared/procedure"
import { deserializeListMetadata } from "../shared/serialize"
import { LIST_MENU_ITEM_ERROR_MAP } from "./errors"
import { ListMenuInput, MenuGroupItemList, MenuItemList } from "./schema"
import type { WPK_MenuItem } from "./types"
import { buildMenuGroupItem, deserializeListMenuInput, extractPath } from "./utils"

export const MENU_PROCEDURES = {
	items: {
		list: createProcedure(
			{
				scope: "api",
				method: "GET",
				path: "/site/menus",
				output: MenuItemList,
				query: ListMenuInput.optional(),
				errors: LIST_MENU_ITEM_ERROR_MAP,
			},
			async ({ context, errors, input }) => {
				const searchParams = deserializeListMenuInput(input.query)
				const response = await context.wordpress.menuItems.list(searchParams)

				if (response.error) {
					switch (response.error.code) {
						case "rest_post_invalid_page_number": {
							throw errors.MENU_ITEM_INVALID_PAGE()
						}
						case "rest_cannot_view": {
							throw errors.MENU_ITEM_FORBIDDEN()
						}
						case "rest_no_route": {
							throw errors.NOT_FOUND()
						}
						default:
							context.logger.error("List menu items unhandled error", response.error, { code: response.error.code })
							throw errors.INTERNAL_SERVER_ERROR()
					}
				}

				// Named rather than mapped straight off `response.data`, so the callbacks below stay
				// contextually typed in a project whose generated tree is still the empty stub.
				const found: WPK_MenuItem[] = response.data

				return {
					items: found.map((item) => ({
						id: item.id,
						parent: item.parent === 0 ? null : item.parent,
						type: item.object,
						objectId: item.object_id,
						href: extractPath(item.url, item.object === "custom"),
						name: item.title.rendered,
						description: item.description,
						target: item.target,
						classes: item.classes.filter(Boolean),
						attrTitle: item.attr_title,
						xfn: item.xfn.filter(Boolean),
						order: item.menu_order,
						invalid: item.invalid,
						meta: stringifiedMetaRecord(item.meta ?? {}),
					})),
					meta: deserializeListMetadata(context.wordpress.resolveList({ data: found, headers: response.headers, searchParams }).meta),
				}
			},
		),

		groupList: createProcedure(
			{
				scope: "api",
				method: "GET",
				path: "/menus/group",
				query: ListMenuInput.optional(),
				errors: LIST_MENU_ITEM_ERROR_MAP,
				output: MenuGroupItemList,
			},
			async ({ context, errors, input }) => {
				const searchParams = deserializeListMenuInput(input.query)
				const response = await context.wordpress.menuItems.list(searchParams)

				if (response.error) {
					switch (response.error.code) {
						case "rest_post_invalid_page_number": {
							throw errors.MENU_ITEM_INVALID_PAGE()
						}
						case "rest_cannot_view": {
							throw errors.MENU_ITEM_FORBIDDEN()
						}
						case "rest_no_route": {
							throw errors.NOT_FOUND()
						}
						default:
							context.logger.error("Group list menu items unhandled error", response.error, { code: response.error.code })
							throw errors.INTERNAL_SERVER_ERROR()
					}
				}

				const found: WPK_MenuItem[] = response.data
				const itemMap = new Map<number, WPK_MenuItem>()

				found.forEach((item) => {
					itemMap.set(item.id, item)
				})

				const rootItems = found.filter((item) => item.parent === 0 || !itemMap.has(item.parent)).sort((a, b) => a.menu_order - b.menu_order)

				return {
					meta: deserializeListMetadata(context.wordpress.resolveList({ data: found, headers: response.headers, searchParams }).meta),
					items: rootItems.map((rootItem) => buildMenuGroupItem(rootItem, found, null)),
				}
			},
		),
	},
}
