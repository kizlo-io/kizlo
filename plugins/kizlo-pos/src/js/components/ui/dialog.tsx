"use client"

import { XIcon } from "@phosphor-icons/react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import * as React from "react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
	container?: React.ComponentProps<typeof DialogPrimitive.Portal>["container"]
	responsive?: boolean
}

const DialogContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>(
	({ className, children, container, responsive = true, ...props }, ref) => (
		<DialogPrimitive.Portal container={container}>
			<DialogPrimitive.Overlay
				data-slot="dialog-overlay"
				className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50 duration-200 data-[state=closed]:animate-out data-[state=open]:animate-in motion-reduce:animate-none"
			/>
			<DialogPrimitive.Content
				ref={ref}
				data-slot="dialog-content"
				className={cn(
					"fixed top-1/2 left-1/2 z-50 block h-auto max-h-[90dvh] w-[min(560px,calc(100%-32px))] max-w-none -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-2xl border border-border bg-background mobile:p-5.5 p-7 text-foreground shadow-lg outline-none duration-200 data-[state=closed]:animate-out data-[state=open]:animate-in motion-reduce:animate-none",
					responsive && [
						"max-[1151px]:inset-x-0 max-[1151px]:top-auto max-[1151px]:bottom-0 max-[1151px]:w-full max-[1151px]:translate-x-0 max-[1151px]:translate-y-0 max-[1151px]:rounded-b-none",
						"max-[1151px]:data-[state=closed]:slide-out-to-bottom-full max-[1151px]:data-[state=open]:slide-in-from-bottom-full",
						"min-[1151px]:data-[state=closed]:fade-out-0 min-[1151px]:data-[state=closed]:zoom-out-95 min-[1151px]:data-[state=open]:fade-in-0 min-[1151px]:data-[state=open]:zoom-in-95",
						"max-[1151px]:after:block max-[1151px]:after:h-[env(safe-area-inset-bottom)]",
					],
					className,
				)}
				{...props}
			>
				<DialogPrimitive.Close className="absolute top-4 right-4 flex size-11 items-center justify-center rounded-sm bg-transparent opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none">
					<XIcon className="size-5" aria-hidden="true" />
					<span className="sr-only">Close</span>
				</DialogPrimitive.Close>
				{children}
			</DialogPrimitive.Content>
		</DialogPrimitive.Portal>
	),
)
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogTitle = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Title>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Title ref={ref} className={cn("pr-10 font-semibold text-[22px] text-foreground", className)} {...props} />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Description>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Description ref={ref} className={cn("text-muted-foreground text-sm", className)} {...props} />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export { Dialog, DialogContent, DialogDescription, DialogTitle }
