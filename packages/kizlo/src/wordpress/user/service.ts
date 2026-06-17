import { WP_CORE_BASE } from "../constants"
import type { WordPressService } from "../service"
import type {
	WP_User,
	WP_UserCreateErrorCode,
	WP_UserCreateInput,
	WP_UserDeleteErrorCode,
	WP_UserDeleteInput,
	WP_UserDeleteResponse,
	WP_UserListErrorCode,
	WP_UserListInput,
	WP_UserRetrieveErrorCode,
	WP_UserRetrieveInput,
	WP_UserUpdateErrorCode,
	WP_UserUpdateInput,
} from "./types"

export class UserService {
	private readonly wordpress: WordPressService

	constructor(wordpress: WordPressService) {
		this.wordpress = wordpress
	}

	public async list(input: WP_UserListInput) {
		const { ...searchParams } = input

		const result = await this.wordpress.get<WP_User[], WP_UserListErrorCode>("/users", {
			base: WP_CORE_BASE,
			searchParams,
		})

		if (result.error) return result

		return {
			...result,
			data: this.wordpress.resolveList({ data: result.data, headers: result.headers, searchParams }),
		}
	}

	public async create(input: WP_UserCreateInput) {
		return this.wordpress.post<WP_User, WP_UserCreateErrorCode>("/users", {
			base: WP_CORE_BASE,
			body: input,
		})
	}

	public async get(input: WP_UserRetrieveInput) {
		const { id, ...searchParams } = input

		return this.wordpress.get<WP_User, WP_UserRetrieveErrorCode>(`/users/${id}`, {
			base: WP_CORE_BASE,
			searchParams,
		})
	}

	public async update(input: WP_UserUpdateInput) {
		const { id, ...body } = input

		return this.wordpress.post<WP_User, WP_UserUpdateErrorCode>(`/users/${id}`, {
			base: WP_CORE_BASE,
			body,
		})
	}

	public async delete(input: WP_UserDeleteInput) {
		const { id, ...searchParams } = input

		return this.wordpress.delete<WP_UserDeleteResponse, WP_UserDeleteErrorCode>(`/users/${id}`, {
			base: WP_CORE_BASE,
			searchParams,
		})
	}
}
