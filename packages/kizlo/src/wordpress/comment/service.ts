import { WP_CORE_BASE } from "../constants"
import type { WordPressService } from "../service"
import type {
	WP_Comment,
	WP_CommentCreateErrorCode,
	WP_CommentCreateInput,
	WP_CommentDeleteErrorCode,
	WP_CommentDeleteInput,
	WP_CommentDeleteResponse,
	WP_CommentListErrorCode,
	WP_CommentListInput,
	WP_CommentRetrieveErrorCode,
	WP_CommentRetrieveInput,
	WP_CommentUpdateErrorCode,
	WP_CommentUpdateInput,
} from "./types"

export class CommentService {
	private readonly wordpress: WordPressService

	constructor(wordpress: WordPressService) {
		this.wordpress = wordpress
	}

	public async list(input: WP_CommentListInput) {
		const { ...searchParams } = input

		const result = await this.wordpress.get<WP_Comment[], WP_CommentListErrorCode>("/comments", {
			base: WP_CORE_BASE,
			searchParams,
		})

		if (result.error) return result

		return {
			...result,
			data: this.wordpress.resolveList({ data: result.data, headers: result.headers, searchParams }),
		}
	}

	public async create(input: WP_CommentCreateInput) {
		return this.wordpress.post<WP_Comment, WP_CommentCreateErrorCode>("/comments", {
			base: WP_CORE_BASE,
			body: input,
		})
	}

	public async get(input: WP_CommentRetrieveInput) {
		const { id, ...searchParams } = input

		return this.wordpress.get<WP_Comment, WP_CommentRetrieveErrorCode>(`/comments/${id}`, {
			base: WP_CORE_BASE,
			searchParams,
		})
	}

	public async update(input: WP_CommentUpdateInput) {
		const { id, ...body } = input

		return this.wordpress.post<WP_Comment, WP_CommentUpdateErrorCode>(`/comments/${id}`, {
			base: WP_CORE_BASE,
			body,
		})
	}

	public async delete(input: WP_CommentDeleteInput) {
		const { id, ...searchParams } = input

		return this.wordpress.delete<WP_CommentDeleteResponse, WP_CommentDeleteErrorCode>(`/comments/${id}`, {
			base: WP_CORE_BASE,
			searchParams,
		})
	}
}
