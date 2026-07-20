import { CATEGORY_ROUTER_MAP } from "./category"
import { COMMENT_ROUTER_MAP } from "./comment"
import { MENU_ROUTER_MAP } from "./menu"
import { PAGE_ROUTER_MAP } from "./page"
import { POST_ROUTER_MAP } from "./post"
import { SEO_ROUTER_MAP } from "./seo"
import { SETTINGS_ROUTER_MAP } from "./settings"
import { TAG_ROUTER_MAP } from "./tag"

export const ROUTER_MAP = {
	posts: POST_ROUTER_MAP,
	pages: PAGE_ROUTER_MAP,
	categories: CATEGORY_ROUTER_MAP,
	tags: TAG_ROUTER_MAP,
	seo: SEO_ROUTER_MAP,
	menus: MENU_ROUTER_MAP,
	comments: COMMENT_ROUTER_MAP,
	settings: SETTINGS_ROUTER_MAP,
}
export type RouterMap = typeof ROUTER_MAP
