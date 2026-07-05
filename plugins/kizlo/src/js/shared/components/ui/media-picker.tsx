import { FileAudioIcon, FileIcon, FileVideoIcon, type Icon, ImageIcon, SpinnerGapIcon } from "@phosphor-icons/react"
import { useState } from "react"
import { toast } from "sonner"
import { type MediaItem, type MediaType, useMediaLibrary } from "@/shared/hooks/use-media-library"
import { cn } from "@/shared/lib/utils"
import { Button } from "./button"

const TYPE_ICON: Record<MediaType, Icon> = {
	image: ImageIcon,
	video: FileVideoIcon,
	audio: FileAudioIcon,
	application: FileIcon,
}

const TYPE_LABEL: Record<MediaType, string> = {
	image: "image",
	video: "video",
	audio: "audio",
	application: "file",
}

// Phrasing (with article) used in the "wrong file dropped" message.
const TYPE_ACCEPT: Record<MediaType, string> = {
	image: "an image",
	video: "a video",
	audio: "an audio file",
	application: "a document",
}

export interface MediaInputProps extends React.HTMLAttributes<HTMLElement> {
	url?: string
	width?: number
	height?: number
	type: MediaType
	label?: string
	desc?: React.ReactNode
	onValueChange?: (item: MediaItem | null) => void
}

export function MediaPicker({ label, desc, width = 1, height = 1, ...props }: MediaInputProps) {
	const [item, setItem] = useState<MediaItem | null>(props.url ? { id: 0, url: props.url, title: "", mime: "" } : null)
	const [isDragging, setDragging] = useState(false)
	const [isUploading, setUploading] = useState(false)
	const media = useMediaLibrary({ type: props.type })

	const TypeIcon = TYPE_ICON[props.type]
	const typeLabel = TYPE_LABEL[props.type]
	const hasPreview = props.type === "image" || props.type === "video"
	const hasDimensions = width > 1 || height > 1

	const setSelected = (selected: MediaItem) => {
		setItem(selected)
		props.onValueChange?.(selected)
	}

	const onSelect = async () => {
		if (isUploading) return

		const selected = (await media.open())[0]
		if (selected) setSelected(selected)
	}

	const onRemove = () => {
		setItem(null)
		props.onValueChange?.(null)
	}

	const onDrop = async (event: React.DragEvent) => {
		event.preventDefault()
		setDragging(false)

		if (isUploading) return

		const file = event.dataTransfer.files?.[0]
		if (!file) return

		if (!file.type.startsWith(props.type)) {
			toast.error(`That file isn't supported here. Please drop ${TYPE_ACCEPT[props.type]}.`)
			return
		}

		if (media.maxUploadSize && file.size > media.maxUploadSize) {
			toast.error(`This ${typeLabel} is too large. The maximum upload size is ${formatBytes(media.maxUploadSize)}.`)
			return
		}

		setUploading(true)
		try {
			setSelected(await media.upload(file))
		} catch (error) {
			const message = (error as { message?: string })?.message
			toast.error(message || "Upload failed, please try again.")
		} finally {
			setUploading(false)
		}
	}

	const dragProps = {
		onDrop,
		onDragOver: (event: React.DragEvent) => {
			event.preventDefault()
			setDragging(true)
		},
		onDragLeave: (event: React.DragEvent) => {
			event.preventDefault()
			setDragging(false)
		},
	}

	return (
		<div className={cn("flex flex-col gap-3", props.className)}>
			{label ? <span className="font-medium text-neutral-900 text-sm">{label}</span> : null}

			{hasPreview ? (
				<button
					type="button"
					onClick={onSelect}
					{...dragProps}
					style={{ aspectRatio: width / height }}
					className={cn(
						"group relative flex w-full max-w-sm cursor-pointer items-center justify-center overflow-clip rounded-lg border border-neutral-300 border-dashed bg-transparent hover:border-primary",
						{
							"border-neutral-300 border-solid": item,
							"p-2": item && props.type === "image",
							"border-primary border-solid": isDragging,
						},
					)}
				>
					{isUploading ? <UploadingOverlay /> : null}

					{item && props.type === "image" ? (
						<img
							alt={item.alt ?? ""}
							src={item.url}
							className="pointer-events-none h-full w-full rounded-md object-cover object-center transition-all duration-300"
						/>
					) : item ? (
						<div className="flex flex-col items-center gap-3 p-6 text-center">
							<TypeIcon className="size-9 text-neutral-500" weight="thin" />
							<p className="w-full break-all text-neutral-900 text-sm">{item.title || `Selected ${typeLabel}`}</p>
						</div>
					) : (
						<div className="flex flex-col items-center p-6 text-center">
							<TypeIcon className="size-9 text-neutral-400" weight="thin" />
							{hasDimensions ? (
								<p className="text-neutral-500 text-sm leading-relaxed">
									Recommended size:{" "}
									<span className="text-neutral-900">
										{width}x{height}px
									</span>
								</p>
							) : (
								<p className="mt-2 text-neutral-500 text-sm capitalize leading-relaxed">Select {TYPE_ACCEPT[props.type]}</p>
							)}
						</div>
					)}
				</button>
			) : (
				<button
					type="button"
					onClick={onSelect}
					{...dragProps}
					className={cn(
						"flex h-10 w-full max-w-sm cursor-pointer items-center gap-2 rounded-md border border-neutral-300 border-dashed bg-transparent px-3 text-left hover:border-primary",
						isDragging && "border-primary border-solid",
					)}
				>
					{isUploading ? (
						<>
							<SpinnerGapIcon className="size-5 shrink-0 animate-spin text-neutral-400" />
							<span className="truncate text-neutral-500 text-sm">Uploading…</span>
						</>
					) : (
						<>
							<TypeIcon className="size-5 shrink-0 text-neutral-400" weight="thin" />
							<span className={cn("truncate text-sm", item ? "text-neutral-900" : "text-neutral-500")}>
								{item ? item.title || `Selected ${typeLabel}` : `Select a ${typeLabel}`}
							</span>
						</>
					)}
				</button>
			)}

			<div className="flex items-center gap-2">
				<Button type="button" variant="secondary" size="sm" onClick={onSelect} className="capitalize">
					{item ? "Replace" : "Select"} {typeLabel}
				</Button>

				{item ? (
					<Button type="button" variant="ghost" size="sm" onClick={onRemove}>
						Remove
					</Button>
				) : null}
			</div>

			{desc ? <p className="text-neutral-500 text-sm leading-relaxed">{desc}</p> : null}
		</div>
	)
}

function formatBytes(bytes: number): string {
	const mb = bytes / (1024 * 1024)
	return mb >= 1 ? `${Math.round(mb)} MB` : `${Math.round(bytes / 1024)} KB`
}

function UploadingOverlay() {
	return (
		<div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg bg-white/80 text-neutral-500 text-sm">
			<SpinnerGapIcon className="size-6 animate-spin" />
			Uploading…
		</div>
	)
}
