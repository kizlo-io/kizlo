import { cn } from "@/lib/utils"

export function Container({ className, theme = "dark", children, ...props }: React.ComponentProps<"div"> & { theme?: "dark" | "light" }) {
	return (
		<section data-container-theme={theme} className="bg-(--container-bg) text-(--container-fg) md:mx-4">
			<div className={cn("mx-auto max-w-360 border-(--container-border) border-x", className)} {...props}>
				{children}
			</div>
		</section>
	)
}

export function Wrapper({
	ticks,
	children,
	border,
	className,
	...props
}: React.ComponentProps<"div"> & {
	ticks?: boolean
	border?: "top" | "bottom" | "top-bottom"
}) {
	return (
		<div
			className={cn(
				"border-(--container-border)",
				{
					"wrapper--ticks": ticks,
					"border-t": border === "top",
					"border-b": border === "bottom",
					"border-y": border === "top-bottom",
				},
				className,
			)}
			{...props}
		>
			{children}
		</div>
	)
}
