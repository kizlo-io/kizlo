import { cn } from "@/shared/lib/utils"

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
	return (
		<div className={cn("group/logo flex w-max items-center *:transition-all *:duration-200", className)} {...props}>
			<div className="aspect-square rounded-md bg-background-panel p-2">
				<LogoIcon className={cn("size-6", logoClassNames)} />
			</div>

			{!iconOnly && <div className={cn("relative text-xl tracking-tight", textClassNames)}>kizlo</div>}
		</div>
	)
}

const LOGO_ICON_DARK = "https://cdn.kizlo.io/logo/icon-dark.svg"

export function LogoIcon({ className, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
	return <img alt="Kizlo" src={LOGO_ICON_DARK} className={cn("object-contain", className)} {...props} />
}
