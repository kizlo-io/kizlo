import { WP_CORE_BASE } from "../constants"
import type { WordPressService } from "../service"
import type {
	WP_Category,
	WP_CategoryCreateErrorCode,
	WP_CategoryCreateInput,
	WP_CategoryDeleteErrorCode,
	WP_CategoryDeleteInput,
	WP_CategoryDeleteResponse,
	WP_CategoryListErrorCode,
	WP_CategoryListInput,
	WP_CategoryRetrieveErrorCode,
	WP_CategoryRetrieveInput,
	WP_CategoryUpdateErrorCode,
	WP_CategoryUpdateInput,
} from "./types"

export class CategoryService {
	private readonly wordpress: WordPressService

	constructor(wordpress: WordPressService) {
		this.wordpress = wordpress
	}

	public async list(input: WP_CategoryListInput) {
		const { ...searchParams } = input

		const result = await this.wordpress.get<WP_Category[], WP_CategoryListErrorCode>("/categories", {
			base: WP_CORE_BASE,
			searchParams,
		})

		if (result.error) return result

		return {
			...result,
			data: this.wordpress.resolveList({ data: result.data, headers: result.headers, searchParams }),
		}
	}

	public async create(input: WP_CategoryCreateInput) {
		return this.wordpress.post<WP_Category, WP_CategoryCreateErrorCode>("/categories", {
			base: WP_CORE_BASE,
			body: input,
		})
	}

	public async get(input: WP_CategoryRetrieveInput) {
		const { id, ...searchParams } = input

		return this.wordpress.get<WP_Category, WP_CategoryRetrieveErrorCode>(`/categories/${id}`, {
			base: WP_CORE_BASE,
			searchParams,
		})
	}

	public async update(input: WP_CategoryUpdateInput) {
		const { id, ...body } = input

		return this.wordpress.post<WP_Category, WP_CategoryUpdateErrorCode>(`/categories/${id}`, {
			base: WP_CORE_BASE,
			body,
		})
	}

	public async delete(input: WP_CategoryDeleteInput) {
		const { id, ...searchParams } = input

		return this.wordpress.delete<WP_CategoryDeleteResponse, WP_CategoryDeleteErrorCode>(`/categories/${id}`, {
			base: WP_CORE_BASE,
			searchParams,
		})
	}
}
