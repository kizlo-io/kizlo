import { useRef } from "react"

export type MediaItem = {
	id: number
	url: string
	title: string
	alt?: string
	mime: string
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

			// store resolver for this call
			resolverRef.current = resolve

			// reuse existing frame
			if (frameRef.current) {
				// optional: clear previous selection
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

	return { open }
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
