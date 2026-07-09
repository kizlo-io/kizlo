import { CaretLeftIcon, type Icon } from "@phosphor-icons/react"
import { NavLink } from "react-router-dom"
import { cn } from "@/shared/lib/utils"

export function SidebarHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return <div data-slot="sidebar-header" className={cn("flex w-full min-w-0 flex-col gap-2 px-2 py-2", className)} {...props} />
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
	/** The root panel: visible at rest, slides left when a group is open. */
	root?: boolean
	/** Group id for a drill-down panel; matched against `active`. */
	id?: string
	/** The currently open group id, or null for the root. */
	active: string | null
}

export function SidebarPanel({ root, id, active, className, ...props }: SidebarPanelProps) {
	const shown = root ? active == null : active === id

	return (
		<div
			data-slot="sidebar-panel"
			aria-hidden={!shown}
			className={cn(
				"absolute inset-0 flex flex-col gap-0.5 overflow-y-auto px-2 transition duration-150 ease-out",
				shown ? "translate-x-0 opacity-100" : cn("pointer-events-none opacity-0", root ? "-translate-x-2" : "translate-x-2"),
				className,
			)}
			{...props}
		/>
	)
}

// Reset first: this app ships Tailwind utilities without Preflight, so bare
// <button>s inherit native/WP-admin chrome (border, background, padding) unless
// explicitly cleared here.
const rowClasses =
	"flex w-full cursor-pointer appearance-none items-center gap-2 rounded-xs border-0 bg-transparent pl-3 pr-1.5 py-1.5 text-left font-medium font-[inherit] text-neutral-600 text-sm no-underline! shadow-none transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus:shadow-none focus:outline-none"

interface SidebarLinkProps extends React.HTMLAttributes<HTMLAnchorElement> {
	to: string
	icon?: Icon
	end?: boolean
}

export function SidebarLink({ to, icon: LinkIcon, end, className, children, ...props }: SidebarLinkProps) {
	return (
		<NavLink
			to={to}
			end={end}
			className={({ isActive }) => cn("h-10", rowClasses, isActive && "bg-neutral-200/70! focus:text-neutral-600", className)}
			{...props}
		>
			{LinkIcon ? <LinkIcon className="size-4 shrink-0" /> : null}
			<span className="min-w-0 flex-1 truncate">{children}</span>
		</NavLink>
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
			<div className="flex size-7 items-center justify-center rounded-xs group-hover:bg-neutral-200 [&_svg]:size-3">{trailing}</div>
		</button>
	)
}

export function SidebarBack({ className, children, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"relative my-2 flex w-max cursor-pointer items-center gap-1 rounded-sm border border-neutral-300 p-0.5 pr-2 pl-1.5",
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
