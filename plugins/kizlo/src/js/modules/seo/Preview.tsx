import { DesktopIcon, DeviceMobileIcon, DotsThreeVerticalIcon, EyeSlashIcon, GlobeIcon } from "@phosphor-icons/react"
import { useState } from "react"
import { Button } from "@/shared/components/ui/button"
import { cn } from "@/shared/lib/utils"

interface PreviewProps {
	title: string
	description: string
	url: string
	indexable: boolean
}

type Device = "desktop" | "mobile"

export function Preview({ title, description, url, indexable }: PreviewProps) {
	const [device, setDevice] = useState<Device>("desktop")

	const { host, crumbs } = parseUrl(url)

	return (
		<section className="flex flex-col">
			<div className="flex h-12 items-center justify-between border-neutral-300 border-b pr-2 pl-4">
				<div>Preview</div>
				<DeviceToggle device={device} onChange={setDevice} />
			</div>

			<SearchResult
				device={device}
				title={title || "Untitled page"}
				description={description || "Add a meta description to control how this page reads in search results."}
				host={host}
				crumbs={crumbs}
				muted={!title || !description}
				hidden={!indexable}
			/>
		</section>
	)
}

function DeviceToggle({ device, onChange }: { device: Device; onChange: (device: Device) => void }) {
	return (
		<div className="inline-flex gap-1 rounded-md p-0.5">
			{(["desktop", "mobile"] as const).map((value) => {
				const Glyph = value === "desktop" ? DesktopIcon : DeviceMobileIcon
				return (
					<Button
						key={value}
						type="button"
						variant={device !== value ? "secondary" : "default"}
						aria-label={value}
						onClick={() => onChange(value)}
						aria-expanded={device === value}
						className={cn("flex size-7! items-center justify-center rounded transition-colors")}
					>
						<Glyph className="size-4" />
					</Button>
				)
			})}
		</div>
	)
}

interface SerpSnippetProps {
	device: Device
	title: string
	description: string
	host: string
	crumbs: string[]
	muted: boolean
	hidden: boolean
}

function SearchResult({ device, title, description, host, crumbs, muted, hidden }: SerpSnippetProps) {
	const isMobile = device === "mobile"

	return (
		<div data-mobile={isMobile} className={cn("group border-neutral-300 border-b bg-neutral-100 p-4")}>
			{hidden ? (
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
						{isMobile ? (
							<span className="truncate">{[host].join(" › ")}</span>
						) : (
							<span className="truncate">{[host, ...crumbs].join(" › ")}</span>
						)}

						<DotsThreeVerticalIcon className="size-4 shrink-0 group-data-[mobile=true]:hidden" />
					</div>
				</div>

				<DotsThreeVerticalIcon className="absolute top-1/2 right-0 size-5 shrink-0 -translate-y-1/2 group-data-[mobile=false]:hidden" />
			</div>

			<h3
				className={cn(
					"mt-2 mb-1 font-normal text-[#1a0dab]",
					isMobile ? "line-clamp-2 text-base leading-snug" : "truncate text-xl leading-7",
				)}
			>
				{title}
			</h3>
			<p className={cn("m-0 text-[#4d5156] text-sm leading-snug", isMobile ? "line-clamp-3" : "line-clamp-2", muted && "italic")}>
				{description}
			</p>
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
