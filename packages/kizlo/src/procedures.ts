import { CATEGORY_PROCEDURES } from "./category"
import { COMMENT_PROCEDURES } from "./comment"
import { MENU_PROCEDURES } from "./menu"
import { PAGE_PROCEDURES } from "./page"
import { POST_PROCEDURES } from "./post"
import { SEO_PROCEDURES } from "./seo"
import { SETTINGS_PROCEDURES } from "./settings"
import { TAG_PROCEDURES } from "./tag"

export const CORE_PROCEDURES = {
	posts: POST_PROCEDURES,
	pages: PAGE_PROCEDURES,
	categories: CATEGORY_PROCEDURES,
	tags: TAG_PROCEDURES,
	seo: SEO_PROCEDURES,
	menus: MENU_PROCEDURES,
	comments: COMMENT_PROCEDURES,
	settings: SETTINGS_PROCEDURES,
}
export type CoreProcedures = typeof CORE_PROCEDURES
