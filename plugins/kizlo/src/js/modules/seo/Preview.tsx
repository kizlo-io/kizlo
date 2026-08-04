import { DotsThreeVerticalIcon, EyeSlashIcon, GlobeIcon } from "@phosphor-icons/react"
import { cn } from "@/shared/lib/utils"

interface PreviewProps {
	title: string
	description: string
	url: string
	indexable: boolean
}

export function Preview({
	url,
	indexable,
	title = "Untitled page",
	description = "Add a meta description to control how this page reads in search results.",
}: PreviewProps) {
	const { host, crumbs } = parseUrl(url)

	return (
		<div className="border-neutral-300 border-y bg-neutral-100 p-4">
			{!indexable ? (
				<div className="mb-2.5 flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-amber-700 text-xs">
					<EyeSlashIcon className="size-3.5 shrink-0" />
					This page is set to stay out of search results.
				</div>
			) : null}

			<div className="relative flex items-center gap-2.5">
				<div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-neutral-50 font-semibold text-neutral-500 text-xs">
					<GlobeIcon />
				</div>

				<div className="min-w-0 leading-tight">
					<div className="truncate font-medium text-[#202124] text-sm">{host}</div>
					<div className="flex min-w-0 items-center text-[#4d5156] text-xs">
						<span className="truncate">{[host, ...crumbs].join(" › ")}</span>
						<DotsThreeVerticalIcon className="size-4 shrink-0" />
					</div>
				</div>
			</div>

			<h3 className="mt-2 mb-1 truncate font-normal text-[#1a0dab] text-xl leading-7">{title}</h3>
			<p className={cn("m-0 line-clamp-2 text-[#4d5156] text-sm leading-snug", !title || (!description && "italic"))}>{description}</p>
		</div>
	)
}

function parseUrl(raw: string): { host: string; crumbs: string[] } {
	try {
		const parsed = new URL(raw)
		const host = parsed.hostname.replace(/^www\./, "")
		const crumbs = parsed.pathname.split("/").filter(Boolean).map(decodeURIComponent)
		return { host, crumbs }
	} catch {
		return { host: raw || "example.com", crumbs: [] }
	}
}
