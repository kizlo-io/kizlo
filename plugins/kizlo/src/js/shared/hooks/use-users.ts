import apiFetch from "@wordpress/api-fetch"
import { useEffect, useState } from "react"

export interface UserOption {
	id: number
	name: string
}

interface WP_RestUser {
	id: number
	name: string
}

// Load the site's WordPress users for identity/author selection. Uses the edit
// context so all accounts are returned (not only those with published posts),
// which requires the `list_users` capability the settings screen already needs.
export function useUsers() {
	const [users, setUsers] = useState<UserOption[]>([])

	useEffect(() => {
		let active = true

		apiFetch<WP_RestUser[]>({ path: "/wp/v2/users?context=edit&per_page=100&orderby=name&order=asc" })
			.then((res) => {
				if (active) setUsers(res.map((user) => ({ id: user.id, name: user.name })))
			})
			.catch(() => {
				if (active) setUsers([])
			})

		return () => {
			active = false
		}
	}, [])

	return users
}
