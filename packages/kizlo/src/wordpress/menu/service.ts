import { WP_CORE_BASE } from "../constants"
import type { WordPressService } from "../service"
import { MenuItemService } from "./items/service"
import type {
	WP_Menu,
	WP_MenuCreateErrorCode,
	WP_MenuCreateInput,
	WP_MenuDeleteErrorCode,
	WP_MenuDeleteInput,
	WP_MenuDeleteResponse,
	WP_MenuListErrorCode,
	WP_MenuListInput,
	WP_MenuRetrieveErrorCode,
	WP_MenuRetrieveInput,
	WP_MenuUpdateErrorCode,
	WP_MenuUpdateInput,
} from "./types"

export class MenuService {
	public readonly items: MenuItemService
	private readonly wordpress: WordPressService

	constructor(wordpress: WordPressService) {
		this.wordpress = wordpress
		this.items = new MenuItemService(wordpress)
	}

	public async list(input: WP_MenuListInput) {
		const { ...searchParams } = input

		const result = await this.wordpress.get<WP_Menu[], WP_MenuListErrorCode>("/menus", {
			base: WP_CORE_BASE,
			searchParams,
		})

		if (result.error) return result

		return {
			...result,
			data: this.wordpress.resolveList({ data: result.data, headers: result.headers, searchParams }),
		}
	}

	public async create(input: WP_MenuCreateInput) {
		return this.wordpress.post<WP_Menu, WP_MenuCreateErrorCode>("/menus", {
			base: WP_CORE_BASE,
			body: input,
		})
	}

	public async get(input: WP_MenuRetrieveInput) {
		const { id, ...searchParams } = input

		return this.wordpress.get<WP_Menu, WP_MenuRetrieveErrorCode>(`/menus/${id}`, {
			base: WP_CORE_BASE,
			searchParams,
		})
	}

	public async update(input: WP_MenuUpdateInput) {
		const { id, ...body } = input

		return this.wordpress.post<WP_Menu, WP_MenuUpdateErrorCode>(`/menus/${id}`, {
			base: WP_CORE_BASE,
			body,
		})
	}

	public async delete(input: WP_MenuDeleteInput) {
		const { id, ...searchParams } = input

		return this.wordpress.delete<WP_MenuDeleteResponse, WP_MenuDeleteErrorCode>(`/menus/${id}`, {
			base: WP_CORE_BASE,
			searchParams,
		})
	}
}
