import { Button as WP_Button } from "@wordpress/components"
import type { LiteralUnion } from "react-hook-form"
import { cn } from "@/shared/lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLElement> {
	variant?: "default" | "secondary" | "ghost" | "link"
	size?: "default" | "xs" | "sm"
	href?: string
	target?: LiteralUnion<"_blank" | "_self" | "_parent" | "_top" | "framename", string>
}

export function Button({ variant, size, className, children, ...props }: ButtonProps) {
	const toWPSize = size === "xs" ? "small" : size === "sm" ? "compact" : "default"
	const toWPVariant = variant === "secondary" ? "secondary" : variant === "link" ? "link" : variant === "ghost" ? "tertiary" : "primary"

	return (
		<WP_Button
			size={toWPSize}
			variant={toWPVariant}
			__next40pxDefaultSize
			className={cn(
				// Show the WP focus ring while a toggle trigger (e.g. a popover) is
				// expanded, since real focus moves into the panel.
				"aria-expanded:wp-ring flex w-max shrink-0 gap-1.5 whitespace-nowrap [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				{
					"[&_svg:not([class*='size-'])]:size-3": size === "xs",
				},
				className,
			)}
			{...(props as object)}
		>
			{children as never}
		</WP_Button>
	)
}
