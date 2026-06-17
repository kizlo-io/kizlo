import { defineErrorMap } from "../shared/error"

export const LIST_MENU_ITEM_ERROR_MAP = defineErrorMap({
	MENU_ITEM_INVALID_PAGE: {
		status: 400,
		message: "The requested page does not exist.",
	},
	MENU_ITEM_FORBIDDEN: {
		status: 403,
		message: "You are not allowed to view menu items.",
	},
})
export type ListMenuItemErrorMap = typeof LIST_MENU_ITEM_ERROR_MAP
