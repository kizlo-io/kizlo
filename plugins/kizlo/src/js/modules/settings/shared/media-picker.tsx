import { ImageIcon, XIcon } from "lucide-react"
import { useState } from "react"
import { type MediaItem, type MediaType, useMediaLibrary } from "@/shared/hooks/use-media-library"
import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"

export interface MediaInputProps extends React.HTMLAttributes<HTMLElement> {
	url?: string
	width: number
	height: number
	type: MediaType
	placeholder?: string
	onValueChange?: (item: MediaItem | null) => void
}

export function MediaPicker({ ...props }: MediaInputProps) {
	const [url, setUrl] = useState<string | null>(props.url ?? null)
	const media = useMediaLibrary()

	const onChange = async () => {
		const item = (await media.open())[0]
		if (!item) return

		setUrl(item.url)
		props.onValueChange?.(item)
	}

	const isSquare = props.width === props.height

	return (
		<button
			type="button"
			onClick={onChange}
			style={{
				aspectRatio: props.width / props.height,
			}}
			className={cn(
				"group relative mb-4 flex cursor-pointer items-center justify-center overflow-clip rounded-md border border-muted-foreground/50 bg-muted",
				isSquare ? "max-w-50" : "max-h-50 w-full max-w-60",
				!url && "border-dashed hover:border-foreground",
				props.className,
			)}
		>
			{url ? (
				<img
					alt=""
					src={url}
					className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center transition-all duration-300 group-hover:blur-sm"
				/>
			) : (
				<div className="flex flex-col items-center justify-center gap-2 p-4">
					<Button type="button" size={"xs"} variant={"outline"} className="bg-card capitalize">
						{props.type === "image" ? <ImageIcon className="text-muted-foreground" /> : null}
						Select {props.type}
					</Button>

					<p className="text-muted-foreground">Or upload a new one.</p>
				</div>
			)}

			{url ? (
				<Button
					size={"icon-xs"}
					type="button"
					variant={"outline"}
					onClick={async (a) => {
						a.stopPropagation()
						setUrl(null)
						props.onValueChange?.(null)
					}}
					className="absolute top-2 right-2 bg-white"
				>
					<XIcon />
				</Button>
			) : null}
		</button>
	)
}
