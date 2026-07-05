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
	// Where focus lands when the panel opens. `true` (default) focuses the panel
	// itself, which is what makes an outside click reliably close it even when
	// the content has no tabbable element. `"firstElement"`/`"firstInputElement"`
	// move focus to a child, but with no tabbable child nothing is focused and
	// the panel won't close on outside click. `false` disables focus entirely.
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
