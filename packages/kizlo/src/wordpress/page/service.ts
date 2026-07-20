import { WP_CORE_BASE } from "../constants"
import type { WordPressService } from "../service"
import type {
	WP_Page,
	WP_PageCreateErrorCode,
	WP_PageCreateInput,
	WP_PageDeleteErrorCode,
	WP_PageDeleteInput,
	WP_PageDeleteResponse,
	WP_PageListErrorCode,
	WP_PageListInput,
	WP_PageRetrieveErrorCode,
	WP_PageRetrieveInput,
	WP_PageUpdateErrorCode,
	WP_PageUpdateInput,
} from "./types"

export class PageService {
	private readonly wordpress: WordPressService

	constructor(wordpress: WordPressService) {
		this.wordpress = wordpress
	}

	public async list(input: WP_PageListInput) {
		const { ...searchParams } = input

		const result = await this.wordpress.get<WP_Page[], WP_PageListErrorCode>("/pages", {
			base: WP_CORE_BASE,
			searchParams,
		})

		if (result.error) return result

		return {
			...result,
			data: this.wordpress.resolveList({ data: result.data, headers: result.headers, searchParams }),
		}
	}

	public async create(input: WP_PageCreateInput) {
		return this.wordpress.post<WP_Page, WP_PageCreateErrorCode>("/pages", {
			base: WP_CORE_BASE,
			body: input,
		})
	}

	public async get(input: WP_PageRetrieveInput) {
		const { id, ...searchParams } = input

		return this.wordpress.get<WP_Page, WP_PageRetrieveErrorCode>(`/pages/${id}`, {
			base: WP_CORE_BASE,
			searchParams,
		})
	}

	public async update(input: WP_PageUpdateInput) {
		const { id, ...body } = input

		return this.wordpress.post<WP_Page, WP_PageUpdateErrorCode>(`/pages/${id}`, {
			base: WP_CORE_BASE,
			body,
		})
	}

	public async delete(input: WP_PageDeleteInput) {
		const { id, ...searchParams } = input

		return this.wordpress.delete<WP_PageDeleteResponse, WP_PageDeleteErrorCode>(`/pages/${id}`, {
			base: WP_CORE_BASE,
			searchParams,
		})
	}
}
