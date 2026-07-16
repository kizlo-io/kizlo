import { MagnifyingGlassIcon } from "@phosphor-icons/react"
import { Modal } from "@wordpress/components"
import { Command as CommandPrimitive } from "cmdk"
import type * as React from "react"
import { cn } from "@/shared/lib/utils"

function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
	return (
		<CommandPrimitive
			data-slot="command"
			className={cn("flex h-full w-full flex-col overflow-hidden rounded-md bg-white text-neutral-900", className)}
			{...props}
		/>
	)
}

function CommandDialog({
	open,
	onOpenChange,
	title = "Command Palette",
	children,
	className,
}: {
	open?: boolean
	onOpenChange?: (open: boolean) => void
	title?: string
	className?: string
	children?: React.ReactNode
}) {
	if (!open) return null

	return (
		<Modal
			title={title}
			contentLabel={title}
			__experimentalHideHeader
			focusOnMount={false}
			onRequestClose={() => onOpenChange?.(false)}
			className={cn(
				"kizlo-finder mx-auto! my-auto! max-h-[85vh]! w-[calc(100%-2rem)]! max-w-2xl! overflow-hidden rounded-2xl! p-0! max-sm:mt-4! max-sm:mb-auto!",
				className,
			)}
		>
			<Command>{children}</Command>
		</Modal>
	)
}

function CommandInput({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Input>) {
	return (
		<div data-slot="command-input-wrapper" className="flex h-9 items-center gap-2 border-neutral-200 border-b px-3">
			<MagnifyingGlassIcon className="size-4 shrink-0 text-neutral-400" />
			<CommandPrimitive.Input
				data-slot="command-input"
				autoFocus
				className={cn(
					"flex h-10 min-h-0 w-full rounded-md border-none! bg-transparent py-3 text-base shadow-none! outline-hidden placeholder:text-neutral-400 focus:border-none! focus:shadow-none! disabled:cursor-not-allowed disabled:opacity-50",
					className,
				)}
				{...props}
			/>

			<Kbd>esc</Kbd>
		</div>
	)
}

function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
	return (
		<CommandPrimitive.List
			data-slot="command-list"
			className={cn("max-h-75 scroll-py-1 overflow-y-auto overflow-x-hidden", className)}
			{...props}
		/>
	)
}

function CommandEmpty({ ...props }: React.ComponentProps<typeof CommandPrimitive.Empty>) {
	return <CommandPrimitive.Empty data-slot="command-empty" className="py-6 text-center text-neutral-500 text-sm" {...props} />
}

function CommandGroup({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Group>) {
	return <CommandPrimitive.Group data-slot="command-group" className={cn("overflow-hidden p-1 text-neutral-900", className)} {...props} />
}

function CommandSeparator({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Separator>) {
	return <CommandPrimitive.Separator data-slot="command-separator" className={cn("-mx-1 h-px bg-neutral-200", className)} {...props} />
}

function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
	return (
		<CommandPrimitive.Item
			data-slot="command-item"
			className={cn(
				"relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden hover:bg-neutral-100 data-[disabled=true]:pointer-events-none data-[selected=true]:bg-neutral-100 data-[disabled=true]:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-neutral-500 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				className,
			)}
			{...props}
		/>
	)
}

function CommandShortcut({ className, ...props }: React.ComponentProps<"span">) {
	return <span data-slot="command-shortcut" className={cn("ml-auto text-neutral-500 text-xs tracking-widest", className)} {...props} />
}

function Kbd({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<kbd
			className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded border border-neutral-200 bg-neutral-100 font-medium font-sans text-[11px] text-neutral-500"
			{...props}
		>
			{props.children}
		</kbd>
	)
}

export {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
	CommandShortcut,
	Kbd,
}
