import { COMMENT_ROUTER_MAP } from "./comment"
import { MENU_ROUTER_MAP } from "./menu"
import { POST_ROUTER_MAP } from "./post"
import { SEO_ROUTER_MAP } from "./seo"

export const ROUTER_MAP = {
	posts: POST_ROUTER_MAP,
	seo: SEO_ROUTER_MAP,
	menus: MENU_ROUTER_MAP,
	comments: COMMENT_ROUTER_MAP,
}
export type RouterMap = typeof ROUTER_MAP
