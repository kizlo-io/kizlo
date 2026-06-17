import { trimLeadingTrailingSlashes } from "@kizlo/shared"
import type { Identifier } from "../shared/identifier"
import type {
	WP_PostCreateErrorCode,
	WP_PostDeleteErrorCode,
	WP_PostListErrorCode,
	WP_PostListInput,
	WP_PostRetrieveErrorCode,
	WP_PostUpdateErrorCode,
} from "../wordpress"
import { WP_KIZLO_BASE } from "../wordpress/constants"
import type { WordPressService } from "../wordpress/service"
import type { WPK_CreatePostTypeInput, WPK_DeletePostTypeInput, WPK_PostType, WPK_UpdatePostTypeInput } from "./service.interface"

export class PostTypeService<T = WPK_PostType> {
	private readonly key: string
	private readonly wordpress: WordPressService

	constructor(key: string, wordpress: WordPressService) {
		this.key = key
		this.wordpress = wordpress
	}

	public async get(identifier: Identifier) {
		return await this.wordpress.get<T, WP_PostRetrieveErrorCode>(this.resolvePath(identifier), {
			base: WP_KIZLO_BASE,
		})
	}

	public async list(input: WP_PostListInput) {
		return await this.wordpress.get<T[], WP_PostListErrorCode>(this.resolvePath(), {
			base: WP_KIZLO_BASE,
			searchParams: { ...input },
		})
	}

	public async create(input: WPK_CreatePostTypeInput) {
		return await this.wordpress.post<T, WP_PostCreateErrorCode>(this.resolvePath(), {
			base: WP_KIZLO_BASE,
			body: input,
		})
	}

	public async update(input: WPK_UpdatePostTypeInput) {
		return await this.wordpress.put<T, WP_PostUpdateErrorCode>(this.resolvePath(input.identifier), {
			base: WP_KIZLO_BASE,
			body: input,
		})
	}

	public async delete(input: WPK_DeletePostTypeInput) {
		return await this.wordpress.delete<T, WP_PostDeleteErrorCode>(this.resolvePath(input.identifier), {
			base: WP_KIZLO_BASE,
			searchParams: { force: input.force },
		})
	}

	private resolvePath(identifier?: Identifier) {
		return `/post-types/${trimLeadingTrailingSlashes(this.key)}${identifier ? `/${identifier.value}` : ``}`
	}
}

export function getPostTypeService<T = WPK_PostType>(key: string, wordpress: WordPressService) {
	return new PostTypeService<T>(key, wordpress)
}
