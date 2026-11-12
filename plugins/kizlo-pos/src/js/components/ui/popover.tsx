"use client"

import * as PopoverPrimitive from "@radix-ui/react-popover"
import * as React from "react"

import { cn } from "@/lib/utils"

const Popover = PopoverPrimitive.Root
const PopoverTrigger = PopoverPrimitive.Trigger

type PopoverContentProps = React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
	container?: React.ComponentProps<typeof PopoverPrimitive.Portal>["container"]
}

const PopoverContent = React.forwardRef<React.ElementRef<typeof PopoverPrimitive.Content>, PopoverContentProps>(
	({ className, align = "center", sideOffset = 4, container, ...props }, ref) => (
		<PopoverPrimitive.Portal container={container}>
			<PopoverPrimitive.Content
				ref={ref}
				data-slot="popover-content"
				align={align}
				sideOffset={sideOffset}
				collisionPadding={12}
				className={cn(
					"data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 z-50 w-72 origin-(--radix-popover-content-transform-origin) rounded-md border bg-background p-4 text-foreground shadow-md outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
					className,
				)}
				{...props}
			/>
		</PopoverPrimitive.Portal>
	),
)
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverContent, PopoverTrigger }
