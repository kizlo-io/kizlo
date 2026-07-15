import { FileAudioIcon, FileIcon, FileVideoIcon, type Icon, ImageIcon, SpinnerGapIcon } from "@phosphor-icons/react"
import { useState } from "react"
import { toast } from "sonner"
import { type MediaItem, type MediaType, useMediaLibrary } from "@/shared/hooks/use-media-library"
import { cn } from "@/shared/lib/utils"

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

const TYPE_ACCEPT: Record<MediaType, string> = {
	image: "an image",
	video: "a video",
	audio: "an audio file",
	application: "a document",
}

export interface MediaInputProps extends React.HTMLAttributes<HTMLElement> {
	url?: string
	/**
	 * The currently committed media id when the picker is driven by a form field.
	 * Passing it makes the preview follow the form value, so a reset (Cancel)
	 * restores the saved media even after the user removed it. Omit it to let the
	 * picker manage its own state.
	 */
	value?: number | null
	type: MediaType
	label: string
	desc?: React.ReactNode
	onValueChange?: (item: MediaItem | null) => void
}

export function MediaPicker({ label, desc, ...props }: MediaInputProps) {
	// Locally remembered pick, so a freshly selected item can render its preview
	// before the parent commits it. Seeded from `url` for uncontrolled callers.
	const [picked, setPicked] = useState<MediaItem | null>(props.url ? { id: 0, url: props.url, title: "", mime: "" } : null)
	const [isDragging, setDragging] = useState(false)
	const [isUploading, setUploading] = useState(false)
	const media = useMediaLibrary({ type: props.type })

	const TypeIcon = TYPE_ICON[props.type]
	const typeLabel = TYPE_LABEL[props.type]
	const hasPreview = props.type === "image" || props.type === "video"

	// In controlled mode the form owns the value (a media id): the preview follows
	// it, falling back to `url` for the saved media and to the local pick while a
	// new selection is still uncommitted. Otherwise the local pick drives it.
	const item: MediaItem | null =
		props.value === undefined
			? picked
			: props.value === null
				? null
				: picked?.id === props.value
					? picked
					: props.url
						? { id: props.value, url: props.url, title: "", mime: "" }
						: null

	const setSelected = (selected: MediaItem) => {
		setPicked(selected)
		props.onValueChange?.(selected)
	}

	const onSelect = async () => {
		if (isUploading) return

		// WP's media modal toggles `overflow: hidden` on <body> while open and
		// resets the window scroll position when it closes, jumping the settings
		// page to the top. Capture and restore the offset around the modal.
		const scrollY = window.scrollY
		const selected = (await media.open())[0]
		requestAnimationFrame(() => window.scrollTo(0, scrollY))

		if (selected) setSelected(selected)
	}

	const onRemove = () => {
		setPicked(null)
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
		<div className={cn("", props.className)}>
			<div className="mb-2 text-[11px] uppercase">{label}</div>

			{hasPreview ? (
				<div>
					{!item ? (
						<div
							role="button"
							tabIndex={0}
							{...dragProps}
							onClick={onSelect}
							data-dragging={isDragging}
							className="group flex w-full cursor-pointer items-center gap-4"
						>
							<div
								className={cn(
									"relative flex size-16 shrink-0 cursor-pointer flex-col items-center justify-center overflow-clip rounded-lg border border-dashed bg-transparent p-0 text-center group-hover:border-primary group-data-[dragging=true]:border-primary group-data-[dragging=true]:border-solid",
								)}
							>
								{isUploading ? <UploadingOverlay /> : null}

								<TypeIcon className="size-6 text-neutral-400" weight="thin" />
							</div>

							<div>
								<div className="mb-1 font-medium group-hover:text-primary">Select or Drag & Drop</div>
								{desc ? <p className="m-0 text-neutral-500 text-xs leading-relaxed">{desc}</p> : null}
							</div>
						</div>
					) : (
						<div className="w-full overflow-clip rounded-lg border border-neutral-300 bg-neutral-100">
							{props.type === "image" ? (
								<div className="h-28 md:h-40">
									<img
										alt={item.alt ?? ""}
										src={item.url}
										className="pointer-events-none h-full w-full rounded-md object-contain transition-all duration-300"
									/>
								</div>
							) : (
								<div className="flex h-40 flex-col items-center gap-3 p-6 text-center">
									<TypeIcon className="size-9 text-neutral-500" weight="thin" />
									<p className="w-full break-all text-neutral-900 text-sm">{item.title || `Selected ${typeLabel}`}</p>
								</div>
							)}

							<div className="flex items-center border-neutral-300 border-t [&>button]:flex-1 [&>button]:cursor-pointer [&>button]:border-0 [&>button]:bg-white [&>button]:p-2 [&>button]:text-neutral-700 [&>button]:shadow-none [&>button]:outline-none [&>button]:hover:bg-neutral-200">
								<button type="button" onClick={onSelect} className="border-neutral-300 border-r!">
									Change
								</button>

								<button type="button" onClick={onRemove}>
									Remove
								</button>
							</div>
						</div>
					)}
				</div>
			) : (
				<button
					type="button"
					onClick={onSelect}
					{...dragProps}
					className={cn(
						"flex h-10 w-full cursor-pointer items-center gap-2 rounded-xs border border-neutral-400 bg-transparent px-3 text-left hover:border-primary",
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
								{item ? item.title || `Selected ${typeLabel}` : `Select or Drag & Drop`}
							</span>
						</>
					)}
				</button>
			)}

			{item && desc ? <p className="mt-2 mb-0 text-neutral-500 text-xs leading-relaxed">{desc}</p> : null}
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
		</div>
	)
}
