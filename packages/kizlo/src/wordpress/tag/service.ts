import { WP_CORE_BASE } from "../constants"
import type { WordPressService } from "../service"
import type {
	WP_Tag,
	WP_TagCreateErrorCode,
	WP_TagCreateInput,
	WP_TagDeleteErrorCode,
	WP_TagDeleteInput,
	WP_TagDeleteResponse,
	WP_TagListErrorCode,
	WP_TagListInput,
	WP_TagRetrieveErrorCode,
	WP_TagRetrieveInput,
	WP_TagUpdateErrorCode,
	WP_TagUpdateInput,
} from "./types"

export class TagService {
	private readonly wordpress: WordPressService

	constructor(wordpress: WordPressService) {
		this.wordpress = wordpress
	}

	public async list(input: WP_TagListInput) {
		const { ...searchParams } = input

		const result = await this.wordpress.get<WP_Tag[], WP_TagListErrorCode>("/tags", {
			base: WP_CORE_BASE,
			searchParams,
		})

		if (result.error) return result

		return {
			...result,
			data: this.wordpress.resolveList({ data: result.data, headers: result.headers, searchParams }),
		}
	}

	public async create(input: WP_TagCreateInput) {
		return this.wordpress.post<WP_Tag, WP_TagCreateErrorCode>("/tags", {
			base: WP_CORE_BASE,
			body: input,
		})
	}

	public async get(input: WP_TagRetrieveInput) {
		const { id, ...searchParams } = input

		return this.wordpress.get<WP_Tag, WP_TagRetrieveErrorCode>(`/tags/${id}`, {
			base: WP_CORE_BASE,
			searchParams,
		})
	}

	public async update(input: WP_TagUpdateInput) {
		const { id, ...body } = input

		return this.wordpress.post<WP_Tag, WP_TagUpdateErrorCode>(`/tags/${id}`, {
			base: WP_CORE_BASE,
			body,
		})
	}

	public async delete(input: WP_TagDeleteInput) {
		const { id, ...searchParams } = input

		return this.wordpress.delete<WP_TagDeleteResponse, WP_TagDeleteErrorCode>(`/tags/${id}`, {
			base: WP_CORE_BASE,
			searchParams,
		})
	}
}
