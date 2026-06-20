import type { WordPressService, WP_User } from "../wordpress"
import { WP_KIZLO_BASE } from "../wordpress"
import type {
	KizloUserDeleteErrorCode,
	KizloUserDeleteInput,
	KizloUserDeleteResponse,
	KizloUserRetrieveErrorCode,
	KizloUserUpdateErrorCode,
	KizloUserUpdateInput,
	KizloUserVerifyErrorCode,
	KizloUserVerifyInput,
} from "./types"

export class KizloUserService {
	private readonly wordpress: WordPressService

	constructor(wordpress: WordPressService) {
		this.wordpress = wordpress
	}

	public async get(identity: { type: "id" | "email" | "username"; value: string | number }) {
		return this.wordpress.get<WP_User, KizloUserRetrieveErrorCode>(`/users/${identity.type}/${encodeURIComponent(identity.value)}`, {
			base: WP_KIZLO_BASE,
		})
	}

	public async update(identity: { type: "id" | "email" | "username"; value: string | number }, input: KizloUserUpdateInput) {
		return this.wordpress.post<WP_User, KizloUserUpdateErrorCode>(`/users/${identity.type}/${encodeURIComponent(identity.value)}`, {
			base: WP_KIZLO_BASE,
			body: input,
		})
	}

	public async delete(identity: { type: "id" | "email" | "username"; value: string | number }, input: KizloUserDeleteInput) {
		const { ...searchParams } = input

		return this.wordpress.delete<KizloUserDeleteResponse, KizloUserDeleteErrorCode>(
			`/users/${identity.type}/${encodeURIComponent(identity.value)}`,
			{
				base: WP_KIZLO_BASE,
				searchParams,
			},
		)
	}

	public async verify(input: KizloUserVerifyInput) {
		return this.wordpress.post<WP_User, KizloUserVerifyErrorCode>("/users/verify", {
			base: WP_KIZLO_BASE,
			body: input,
		})
	}
}

export function getKizloUserService(wordpress: WordPressService) {
	return new KizloUserService(wordpress)
}
