import { WP_CORE_BASE } from "../constants"
import type { WordPressService } from "../service"
import type {
	WP_Post,
	WP_PostCreateErrorCode,
	WP_PostCreateInput,
	WP_PostDeleteErrorCode,
	WP_PostDeleteInput,
	WP_PostDeleteResponse,
	WP_PostListErrorCode,
	WP_PostListInput,
	WP_PostRetrieveErrorCode,
	WP_PostRetrieveInput,
	WP_PostUpdateErrorCode,
	WP_PostUpdateInput,
} from "./types"

export class PostService {
	private readonly wordpress: WordPressService

	constructor(wordpress: WordPressService) {
		this.wordpress = wordpress
	}

	public async list(input: WP_PostListInput) {
		const { ...searchParams } = input

		const result = await this.wordpress.get<WP_Post[], WP_PostListErrorCode>("/posts", {
			base: WP_CORE_BASE,
			searchParams,
		})

		if (result.error) return result

		return {
			...result,
			data: this.wordpress.resolveList({ data: result.data, headers: result.headers, searchParams }),
		}
	}

	public async create(input: WP_PostCreateInput) {
		return this.wordpress.post<WP_Post, WP_PostCreateErrorCode>("/posts", {
			base: WP_CORE_BASE,
			body: input,
		})
	}

	public async get(input: WP_PostRetrieveInput) {
		const { id, ...searchParams } = input

		return this.wordpress.get<WP_Post, WP_PostRetrieveErrorCode>(`/posts/${id}`, {
			base: WP_CORE_BASE,
			searchParams,
		})
	}

	public async update(input: WP_PostUpdateInput) {
		const { id, ...body } = input

		return this.wordpress.post<WP_Post, WP_PostUpdateErrorCode>(`/posts/${id}`, {
			base: WP_CORE_BASE,
			body,
		})
	}

	public async delete(input: WP_PostDeleteInput) {
		const { id, ...searchParams } = input

		return this.wordpress.delete<WP_PostDeleteResponse, WP_PostDeleteErrorCode>(`/posts/${id}`, {
			base: WP_CORE_BASE,
			searchParams,
		})
	}
}
