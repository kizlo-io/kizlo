import { CaretLeftIcon, type Icon } from "@phosphor-icons/react"
import { NavLink } from "react-router-dom"
import { cn } from "@/shared/lib/utils"

export function SidebarHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return <div data-slot="sidebar-header" className={cn("flex w-full min-w-0 flex-col gap-2 px-2 pt-2", className)} {...props} />
}

export function SidebarDrillDown({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return <div data-slot="sidebar-drill-down" className={cn("relative flex-1 overflow-hidden", className)} {...props} />
}

export function SidebarFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return <div data-slot="sidebar-footer" className={cn("shrink-0 border-neutral-200 border-t p-3", className)} {...props} />
}

export function SidebarSection({ label, className, children, ...props }: { label: string } & React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div data-slot="sidebar-section" className={cn("flex flex-col gap-0.5 pt-5 first:pt-1", className)} {...props}>
			<div className="px-3 pb-1 font-medium text-[11px] text-neutral-400 uppercase tracking-wider">{label}</div>
			{children}
		</div>
	)
}

interface SidebarPanelProps extends React.HTMLAttributes<HTMLDivElement> {
	/** Node id this panel represents; omit for the root panel. */
	panelId?: string
	/** The current open stack of node ids, from root. Empty = root is shown. */
	stack: string[]
}

export function SidebarPanel({ panelId, stack, className, ...props }: SidebarPanelProps) {
	const isRoot = panelId == null
	const top = stack[stack.length - 1] ?? null
	const shown = isRoot ? stack.length === 0 : top === panelId
	// A panel drilled *past* (an ancestor of the current top) slides left; anything
	// else that's hidden is *ahead* of the current panel and slides in from the right.
	const isAncestor = isRoot ? stack.length > 0 : panelId != null && stack.includes(panelId) && top !== panelId

	return (
		<div
			data-slot="sidebar-panel"
			aria-hidden={!shown}
			className={cn(
				"absolute inset-0 flex flex-col gap-0.5 overflow-y-auto px-2 transition duration-150 ease-out",
				shown ? "translate-x-0 opacity-100" : cn("pointer-events-none opacity-0", isAncestor ? "-translate-x-2" : "translate-x-2"),
				className,
			)}
			{...props}
		/>
	)
}

const rowClasses =
	"flex w-full cursor-pointer appearance-none items-center gap-2 rounded-xs border-0 bg-transparent pl-3 pr-1.5 py-1.5 text-left font-medium font-[inherit] text-neutral-700 text-sm no-underline! shadow-none transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus:shadow-none focus:outline-none"

interface SidebarLinkProps extends React.HTMLAttributes<HTMLAnchorElement> {
	to: string
	icon?: Icon
	end?: boolean
	/** Rendered at the end of the row, e.g. a status badge. */
	trailing?: React.ReactNode
	/** Override the active state. Use for links that differ only by hash, where
	 *  NavLink's pathname-only matching would light every one at once. */
	active?: boolean
}

export function SidebarLink({ to, icon: LinkIcon, end, trailing, active, className, children, ...props }: SidebarLinkProps) {
	return (
		<NavLink
			to={to}
			end={end}
			data-active={active}
			className={({ isActive }) =>
				cn("group h-10", rowClasses, (active ?? isActive) && "bg-neutral-200/70! focus:text-neutral-600", className)
			}
			{...props}
		>
			{LinkIcon ? <LinkIcon className="size-4 shrink-0" /> : null}
			<span className="min-w-0 flex-1 truncate">{children}</span>
			{trailing}
		</NavLink>
	)
}

export function SidebarBadge({ children }: { children: React.ReactNode }) {
	return (
		<span className="shrink-0 rounded-sm bg-neutral-200 px-1.5 py-0.5 font-medium text-[10px] text-neutral-600 uppercase tracking-wide">
			{children}
		</span>
	)
}

interface SidebarButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	icon?: Icon
	trailing?: React.ReactNode
	/** Highlight the row, e.g. when the group owns the active route. */
	active?: boolean
}

export function SidebarButton({ icon: ButtonIcon, trailing, active, className, children, ...props }: SidebarButtonProps) {
	return (
		<button
			type="button"
			className={cn("group h-10", rowClasses, active && "bg-neutral-200/70! focus:text-neutral-600", className)}
			{...props}
		>
			{ButtonIcon ? <ButtonIcon className="size-4 shrink-0" /> : null}
			<span className="min-w-0 flex-1 truncate">{children}</span>
			{trailing}
		</button>
	)
}

export function SidebarBack({ className, children, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"relative my-2 flex w-full cursor-pointer items-center gap-1 rounded-xs p-0.5 py-2 pr-2 pl-1.5 hover:bg-neutral-100",
				"text-neutral-900",
				className,
			)}
			{...props}
		>
			<CaretLeftIcon className="size-3 shrink-0" />
			<span className="min-w-0 flex-1 truncate text-[10px] uppercase">Back</span>
		</div>
	)
}
