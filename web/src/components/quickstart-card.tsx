import Link from "fumadocs-core/link"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function QuickstartCard({ href, icon, title, comingSoon }: { href?: string; icon: ReactNode; title: string; comingSoon?: boolean }) {
	const Comp = href ? Link : "div"
	return (
		<Comp
			href={href as string}
			className={cn(
				"not-prose @max-lg:col-span-full flex items-center gap-3 rounded-xl border bg-fd-card p-4 text-fd-card-foreground transition-colors",
				href && "hover:bg-fd-accent/80",
				comingSoon && "opacity-60",
			)}
		>
			<div className="w-fit shrink-0 rounded-lg border bg-fd-muted p-1.5 text-fd-muted-foreground shadow-md [&_svg]:size-8">{icon}</div>
			<div className="flex flex-col">
				<span className="font-medium text-sm">{title}</span>
				{comingSoon ? <span className="text-fd-muted-foreground text-xs">Coming soon</span> : null}
			</div>
		</Comp>
	)
}
