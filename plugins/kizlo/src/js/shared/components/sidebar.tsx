import { CaretLeftIcon, type Icon } from "@phosphor-icons/react"
import { NavLink } from "react-router-dom"
import { cn } from "@/shared/lib/utils"

export function SidebarHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return <div data-slot="sidebar-header" className={cn("flex h-(--kizlo-header) shrink-0 items-center gap-2 px-4", className)} {...props} />
}

export function SidebarDrillDown({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return <div data-slot="sidebar-drill-down" className={cn("relative flex-1 overflow-hidden", className)} {...props} />
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
}

export function SidebarButton({ icon: ButtonIcon, trailing, className, children, ...props }: SidebarButtonProps) {
	return (
		<button type="button" className={cn("group h-10", rowClasses, className)} {...props}>
			{ButtonIcon ? <ButtonIcon className="size-4 shrink-0" /> : null}
			<span className="min-w-0 flex-1 truncate">{children}</span>
			<div className="flex size-7 items-center justify-center rounded-xs group-hover:bg-neutral-200 [&_svg]:size-3">{trailing}</div>
		</button>
	)
}

export function SidebarBack({ className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
	return (
		<button type="button" className={cn("relative h-10 text-center!", rowClasses, "text-neutral-900", className)} {...props}>
			<CaretLeftIcon className="absolute top-1/2 left-3 size-4 shrink-0 -translate-y-1/2" />
			<span className="min-w-0 flex-1 truncate">{children}</span>
		</button>
	)
}
