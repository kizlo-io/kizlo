import type * as React from "react"

import { cn } from "@/shared/lib/utils"

function Card({ disabled, children, className, ...props }: { disabled?: boolean } & React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card"
			className={cn("relative flex flex-col gap-6 overflow-clip rounded-xl border bg-card py-6 text-card-foreground", className)}
			{...props}
		>
			{disabled && <div className="absolute inset-0 z-10 h-full w-full cursor-not-allowed bg-background opacity-50"></div>}
			{children}
		</div>
	)
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-header"
			className={cn(
				"@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
				className,
			)}
			{...props}
		/>
	)
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="card-title" className={cn("font-semibold leading-none", className)} {...props} />
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="card-description" className={cn("text-muted-foreground text-sm", className)} {...props} />
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div data-slot="card-action" className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)} {...props} />
	)
}

function CardContent({ children, className, ...props }: React.ComponentProps<"div">) {
	return (
		<div data-slot="card-content" className={cn("px-6", className)} {...props}>
			{children}
		</div>
	)
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="card-footer" className={cn("flex items-center px-6 [.border-t]:pt-6", className)} {...props} />
}

export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle }
