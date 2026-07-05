import { useNavigate } from "react-router-dom"
import { cn } from "@/shared/lib/utils"

const LOGO_ICON_DARK = "https://cdn.kizlo.io/logo/icon-dark.svg"

export function Logo({
	iconOnly = false,
	className,
	logoClassNames,
	textClassNames,
	...props
}: {
	iconOnly?: boolean
	logoClassNames?: string
	textClassNames?: string
} & React.HTMLAttributes<HTMLElement>) {
	const navigate = useNavigate()
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: ignore
		<div className={cn("flex w-max cursor-pointer items-center gap-2", className)} onClick={() => navigate("/general/site")} {...props}>
			<img alt="Kizlo" src={LOGO_ICON_DARK} className={cn("size-6 object-contain", className)} {...props} />

			{!iconOnly && <div className={cn("relative text-xl tracking-tight", textClassNames)}>kizlo</div>}
		</div>
	)
}
