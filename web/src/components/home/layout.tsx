import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import type { ComponentProps, ReactNode } from "react"
import { cn } from "@/lib/utils"

export function Section({ className, children, ...props }: ComponentProps<"section">) {
	return (
		<section className={cn("scroll-mt-8 border-border border-t px-6 py-16 sm:px-10 lg:px-16 lg:py-24", className)} {...props}>
			{children}
		</section>
	)
}

export function TextLink({ children, className, ...props }: ComponentProps<typeof Link>) {
	return (
		<Link className={cn("inline-flex items-center gap-2 font-medium text-sm underline-offset-4 hover:underline", className)} {...props}>
			{children}
			<ArrowRightIcon aria-hidden="true" className="size-4 shrink-0" />
		</Link>
	)
}

export function FeatureRow({ children, visual }: { children: ReactNode; visual: ReactNode }) {
	return (
		<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,24rem),1fr))] items-center gap-8 border-border border-t py-10 lg:gap-16">
			<div className="max-w-xl">{children}</div>
			{visual}
		</div>
	)
}
