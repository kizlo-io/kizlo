import Image, { type StaticImageData } from "next/image"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export type VisualSlotProps = {
	title: string
	medium: string
	instructions: string
	takeaway: string
	showBrief: boolean
	concept?: { src: StaticImageData; alt: string; sizes: string }
	children?: ReactNode
	className?: string
}

export function VisualSlot({ title, medium, instructions, takeaway, showBrief, concept, children, className }: VisualSlotProps) {
	if (children) return <div className={cn("min-w-0", className)}>{children}</div>
	if (!showBrief) return null
	if (concept) {
		return (
			<figure className={cn("home-visual min-w-0 overflow-hidden border border-border bg-card", className)}>
				<Image src={concept.src} alt={concept.alt} sizes={concept.sizes} className="h-auto w-full" />
				<figcaption className="flex flex-wrap items-center justify-between gap-3 border-border border-t px-4 py-3 text-muted-foreground text-xs">
					<span>Concept image · {title}</span>
					<a
						href={concept.src.src}
						target="_blank"
						rel="noreferrer"
						className="underline underline-offset-4"
						aria-label={`View full-size concept: ${title}`}
					>
						View full size
					</a>
				</figcaption>
			</figure>
		)
	}

	return (
		<figure
			className={cn("home-visual flex min-h-60 min-w-0 flex-col justify-between gap-8 border border-border bg-card p-6 sm:p-8", className)}
		>
			<figcaption className="flex flex-wrap justify-between gap-3 font-mono text-muted-foreground text-xs uppercase tracking-wider">
				<span>Visual brief · {title}</span>
				<span>{medium}</span>
			</figcaption>
			<div className="max-w-xl">
				<p className="text-base leading-relaxed">{instructions}</p>
				<p className="mt-3 text-muted-foreground text-sm leading-relaxed">{takeaway}</p>
			</div>
		</figure>
	)
}
