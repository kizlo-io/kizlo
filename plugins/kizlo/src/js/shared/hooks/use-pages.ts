import apiFetch from "@wordpress/api-fetch"
import { useEffect, useState } from "react"

export interface PageOption {
	id: number
	title: string
}

interface WP_RestPage {
	id: number
	title: { rendered: string }
}

// Load published WordPress pages for breadcrumb / navigation pickers.
export function usePages() {
	const [pages, setPages] = useState<PageOption[]>([])

	useEffect(() => {
		let active = true

		apiFetch<WP_RestPage[]>({ path: "/wp/v2/pages?status=publish&per_page=100&orderby=title&order=asc" })
			.then((res) => {
				if (active) setPages(res.map((page) => ({ id: page.id, title: page.title.rendered })))
			})
			.catch(() => {
				if (active) setPages([])
			})

		return () => {
			active = false
		}
	}, [])

	return pages
}
