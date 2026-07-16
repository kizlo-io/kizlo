import { Dropdown } from "@wordpress/components"
import { cn } from "@/shared/lib/utils"

export type PopoverPlacement =
	| "top"
	| "top-start"
	| "top-end"
	| "bottom"
	| "bottom-start"
	| "bottom-end"
	| "left"
	| "left-start"
	| "left-end"
	| "right"
	| "right-start"
	| "right-end"

export interface PopoverRenderProps {
	isOpen: boolean
	onToggle: () => void
	onClose: () => void
}

export interface PopoverProps {
	trigger: (props: PopoverRenderProps) => React.ReactNode
	children: React.ReactNode | ((props: PopoverRenderProps) => React.ReactNode)
	placement?: PopoverPlacement
	offset?: number
	focusOnMount?: boolean | "firstElement" | "firstInputElement"
	className?: string
	contentClassName?: string
}

export function Popover({
	trigger,
	children,
	placement = "bottom-start",
	offset = 8,
	focusOnMount = true,
	className,
	contentClassName,
}: PopoverProps) {
	return (
		<Dropdown
			className={className}
			contentClassName={cn("min-w-56", contentClassName)}
			focusOnMount={focusOnMount}
			popoverProps={{ placement, offset }}
			renderToggle={trigger as never}
			renderContent={((props: PopoverRenderProps) => (typeof children === "function" ? children(props) : children)) as never}
		/>
	)
}
