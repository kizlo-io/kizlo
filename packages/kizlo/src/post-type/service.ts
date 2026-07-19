import { trimLeadingTrailingSlashes } from "@kizlo/shared"
import type { Identifier } from "../shared/identifier"
import type { WordPressService, WP_PostListInput } from "../wordpress"
import { WP_KIZLO_BASE } from "../wordpress"
import type {
	WPK_CreatePostTypeInput,
	WPK_DeletePostTypeInput,
	WPK_PostType,
	WPK_PostTypeCreateErrorCode,
	WPK_PostTypeDeleteErrorCode,
	WPK_PostTypeListErrorCode,
	WPK_PostTypeRetrieveErrorCode,
	WPK_PostTypeUpdateErrorCode,
	WPK_UpdatePostTypeInput,
} from "./service.interface"

export class PostTypeService<T = WPK_PostType> {
	private readonly key: string
	private readonly wordpress: WordPressService

	constructor(key: string, wordpress: WordPressService) {
		this.key = key
		this.wordpress = wordpress
	}

	public async get(identifier: Identifier) {
		return await this.wordpress.get<T, WPK_PostTypeRetrieveErrorCode>(this.resolvePath(identifier), {
			base: WP_KIZLO_BASE,
		})
	}

	public async list(input: WP_PostListInput) {
		return await this.wordpress.get<T[], WPK_PostTypeListErrorCode>(this.resolvePath(), {
			base: WP_KIZLO_BASE,
			searchParams: { ...input },
		})
	}

	public async create(input: WPK_CreatePostTypeInput) {
		return await this.wordpress.post<T, WPK_PostTypeCreateErrorCode>(this.resolvePath(), {
			base: WP_KIZLO_BASE,
			body: input,
		})
	}

	public async update(input: WPK_UpdatePostTypeInput) {
		return await this.wordpress.put<T, WPK_PostTypeUpdateErrorCode>(this.resolvePath(input.identifier), {
			base: WP_KIZLO_BASE,
			body: input,
		})
	}

	public async delete(input: WPK_DeletePostTypeInput) {
		return await this.wordpress.delete<T, WPK_PostTypeDeleteErrorCode>(this.resolvePath(input.identifier), {
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
