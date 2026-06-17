import { readTestCredentials } from "./env"

function adminAuthHeader(): string {
	const creds = readTestCredentials().users.admin
	const token = Buffer.from(`${creds.username}:${creds.app_password}`).toString("base64")
	return `Basic ${token}`
}

async function wpFetch(path: string, init?: RequestInit): Promise<Response> {
	const { url } = readTestCredentials()
	const headers = new Headers(init?.headers)
	headers.set("Authorization", adminAuthHeader())
	return fetch(`${url}${path}`, { ...init, headers })
}

export async function deleteCommentsBy(wpUserId: number): Promise<void> {
	const res = await wpFetch(`/wp-json/wp/v2/comments?author=${wpUserId}&per_page=100&context=edit`)
	if (!res.ok) return
	const comments = (await res.json()) as Array<{ id: number }>
	await Promise.all(comments.map((c) => wpFetch(`/wp-json/wp/v2/comments/${c.id}?force=true`, { method: "DELETE" })))
}

export async function deleteAllOrdersFor(wpUserId: number): Promise<void> {
	const res = await wpFetch(`/wp-json/wc/v3/orders?customer=${wpUserId}&per_page=100`)
	if (!res.ok) return
	const orders = (await res.json()) as Array<{ id: number }>
	await Promise.all(orders.map((o) => wpFetch(`/wp-json/wc/v3/orders/${o.id}?force=true`, { method: "DELETE" })))
}

export async function resetCart(opts: { wpUserId: number }): Promise<void> {
	await wpFetch(`/wp-json/wc/store/v1/cart/items`, {
		method: "DELETE",
		headers: { "X-Kizlo-User-Id": String(opts.wpUserId) },
	})
}
