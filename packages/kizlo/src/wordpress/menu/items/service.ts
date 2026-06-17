import { WP_CORE_BASE } from "../../constants"
import type { WordPressService } from "../../service"
import type {
	WP_MenuItem,
	WP_MenuItemCreateErrorCode,
	WP_MenuItemCreateInput,
	WP_MenuItemDeleteErrorCode,
	WP_MenuItemDeleteInput,
	WP_MenuItemDeleteResponse,
	WP_MenuItemListErrorCode,
	WP_MenuItemListInput,
	WP_MenuItemRetrieveErrorCode,
	WP_MenuItemRetrieveInput,
	WP_MenuItemUpdateErrorCode,
	WP_MenuItemUpdateInput,
} from "./types"

export class MenuItemService {
	private readonly wordpress: WordPressService

	constructor(wordpress: WordPressService) {
		this.wordpress = wordpress
	}

	public async list(input: WP_MenuItemListInput) {
		const { ...searchParams } = input

		const result = await this.wordpress.get<WP_MenuItem[], WP_MenuItemListErrorCode>("/menu-items", {
			base: WP_CORE_BASE,
			searchParams,
		})

		if (result.error) return result

		return {
			...result,
			data: this.wordpress.resolveList({ data: result.data, headers: result.headers, searchParams }),
		}
	}

	public async create(input: WP_MenuItemCreateInput) {
		return this.wordpress.post<WP_MenuItem, WP_MenuItemCreateErrorCode>("/menu-items", {
			base: WP_CORE_BASE,
			body: input,
		})
	}

	public async get(input: WP_MenuItemRetrieveInput) {
		const { id, ...searchParams } = input

		return this.wordpress.get<WP_MenuItem, WP_MenuItemRetrieveErrorCode>(`/menu-items/${id}`, {
			base: WP_CORE_BASE,
			searchParams,
		})
	}

	public async update(input: WP_MenuItemUpdateInput) {
		const { id, ...body } = input

		return this.wordpress.post<WP_MenuItem, WP_MenuItemUpdateErrorCode>(`/menu-items/${id}`, {
			base: WP_CORE_BASE,
			body,
		})
	}

	public async delete(input: WP_MenuItemDeleteInput) {
		const { id, ...searchParams } = input

		return this.wordpress.delete<WP_MenuItemDeleteResponse, WP_MenuItemDeleteErrorCode>(`/menu-items/${id}`, {
			base: WP_CORE_BASE,
			searchParams,
		})
	}
}
