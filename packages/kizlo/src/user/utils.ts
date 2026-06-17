import type { WP_User } from "../wordpress"
import type { User } from "./schema"

export function deserializeUser(data: WP_User): User {
	const avatar = data.avatar_urls["96"]

	return {
		id: data.id,
		avatar: avatar ? { id: 0, alt: data.nickname, name: data.nickname, src: avatar } : null,
		description: data.description,
		email: data.email,
		nickname: data.nickname,
		firstName: data.first_name,
		lastName: data.last_name,
		locale: data.locale,
		meta: {},
		username: data.username,
		registeredAt: new Date(data.registered_date).getTime(),
	}
}
