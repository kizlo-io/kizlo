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
		<div className={cn("group/logo flex w-max items-center gap-2 *:transition-all *:duration-200", className)} {...props}>
			<div className="aspect-square rounded-md bg-background-panel p-2">
				<LogoIcon className={cn("size-6", logoClassNames)} />
			</div>

			{!iconOnly && (
				<div className={cn("relative text-2xl", textClassNames)}>
					<span className="tracking-tight">kizlo</span>

					<div className="absolute top-0 -right-5 rounded-full font-semibold text-[8px] uppercase leading-none opacity-80">Beta</div>
				</div>
			)}
		</div>
	)
}

export function LogoIcon({ ...props }: React.SVGProps<SVGSVGElement>) {
	return (
		// biome-ignore lint/a11y/noSvgWithoutTitle: <none>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="678"
			height="505"
			viewBox="0 0 678 505"
			fill="none"
			{...props}
			className={cn("text-foreground", props.className)}
		>
			<g clipPath="url(#clip0_26_17)">
				<path
					d="M265.668 132.834C265.668 59.4717 206.196 0 132.834 0C59.4717 0 0 59.4717 0 132.834V371.935C0 445.297 59.4717 504.769 132.834 504.769C206.196 504.769 265.668 445.297 265.668 371.935V132.834Z"
					fill="currentColor"
				/>
				<path
					d="M555.689 -0.000488281H400.716C333.468 -0.000488281 278.952 54.5153 278.952 121.764C278.952 189.012 333.468 243.528 400.716 243.528H555.689C622.938 243.528 677.453 189.012 677.453 121.764C677.453 54.5153 622.938 -0.000488281 555.689 -0.000488281Z"
					fill="currentColor"
				/>
				<path
					d="M555.689 261.24H400.716C333.468 261.24 278.952 315.756 278.952 383.004C278.952 450.253 333.468 504.768 400.716 504.768H555.689C622.938 504.768 677.453 450.253 677.453 383.004C677.453 315.756 622.938 261.24 555.689 261.24Z"
					fill="currentColor"
				/>
			</g>
			<defs>
				<clipPath id="clip0_26_17">
					<rect width="677.453" height="504.769" fill="currentColor" />
				</clipPath>
			</defs>
		</svg>
	)
}
