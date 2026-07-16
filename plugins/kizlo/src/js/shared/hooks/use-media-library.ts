import apiFetch from "@wordpress/api-fetch"
import { useRef } from "react"

export type MediaItem = {
	id: number
	url: string
	title: string
	alt?: string
	mime: string
}

type WP_RestMedia = {
	id: number
	source_url: string
	title: { rendered: string }
	alt_text: string
	mime_type: string
}

export type MediaType = "image" | "video" | "audio" | "application"

export type UseMediaOptions = {
	multiple?: boolean
	title?: string
	buttonText?: string
	type?: MediaType
}

export function useMediaLibrary(options: UseMediaOptions = {}) {
	const frameRef = useRef<any>(null)
	const resolverRef = useRef<((items: MediaItem[]) => void) | null>(null)

	const open = (): Promise<MediaItem[]> => {
		return new Promise((resolve) => {
			if (!window.wp?.media) {
				throw new Error("wp.media is not available")
			}

			resolverRef.current = resolve

			if (frameRef.current) {
				frameRef.current.state().get("selection").reset()
				frameRef.current.open()
				return
			}

			const frame = window.wp.media({
				multiple: options.multiple ?? false,
				title: options.title ?? "Select Media",
				button: { text: options.buttonText ?? "Use this media" },
				library: options.type ? { type: options.type } : undefined,
			})

			const handleSelect = () => {
				const selection = frame.state().get("selection")

				let items: MediaItem[]

				if (options.multiple) {
					items = selection.map((file: any) => mapMedia(file.toJSON()))
				} else {
					const file = selection.first()
					items = file ? [mapMedia(file.toJSON())] : []
				}

				resolverRef.current?.(items)
			}

			frame.on("select", handleSelect)

			frameRef.current = frame
			frame.open()
		})
	}

	const upload = async (file: File): Promise<MediaItem> => {
		const body = new FormData()
		body.append("file", file, file.name)

		const media = await apiFetch<WP_RestMedia>({
			path: "/wp/v2/media",
			method: "POST",
			body,
		})

		return {
			id: media.id,
			url: media.source_url,
			title: media.title?.rendered ?? file.name,
			alt: media.alt_text,
			mime: media.mime_type,
		}
	}

	return { open, upload, maxUploadSize: getMaxUploadSize() }
}

function getMaxUploadSize(): number | null {
	const raw = window._wpPluploadSettings?.defaults?.filters?.max_file_size
	const bytes = typeof raw === "string" ? Number.parseInt(raw, 10) : typeof raw === "number" ? raw : NaN
	return Number.isFinite(bytes) && bytes > 0 ? bytes : null
}

function mapMedia(file: any): MediaItem {
	return {
		id: file.id,
		url: file.url,
		title: file.title,
		alt: file.alt,
		mime: file.mime,
	}
}
