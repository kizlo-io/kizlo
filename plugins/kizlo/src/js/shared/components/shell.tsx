import { cn } from "@/shared/lib/utils"

/**
 * Structural layout primitives for the settings app.
 *
 * Composition:
 *   <Shell>
 *     <ShellSidebar>…</ShellSidebar>
 *     <ShellMain>
 *       <ShellHeader>…</ShellHeader>
 *       <ShellBody>…</ShellBody>
 *     </ShellMain>
 *   </Shell>
 *
 * The shell lives inside wp-admin, so vertical measurements are offset below
 * the admin bar via the --kizlo-admin-bar var. The bar is only fixed ≥ md
 * (32px); on mobile it's absolutely positioned and scrolls away, so the offset
 * is 0 there and sticky elements pin to the viewport top.
 * --kizlo-header keeps the sidebar brand area and the main header aligned.
 */

export function Shell({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			data-slot="shell"
			className={cn(
				"relative flex min-h-[calc(100vh-var(--kizlo-admin-bar))] [--kizlo-admin-bar:0px] [--kizlo-header:56px] md:[--kizlo-admin-bar:32px]",
				className,
			)}
			{...props}
		/>
	)
}

interface ShellSidebarProps extends React.HTMLAttributes<HTMLElement> {
	/** Controls the mobile drawer. Ignored ≥ md, where the rail is always shown. */
	open?: boolean
	/** Called when the mobile backdrop is tapped. */
	onClose?: () => void
}

export function ShellSidebar({ open = false, onClose, className, children, ...props }: ShellSidebarProps) {
	return (
		<>
			{open && (
				<button
					type="button"
					aria-label="Close menu"
					className="fixed inset-0 z-99999 cursor-pointer appearance-none border-0 bg-neutral-950/40 p-0 md:hidden"
					onClick={onClose}
				/>
			)}

			<aside
				data-slot="shell-sidebar"
				data-open={open}
				className={cn(
					"fixed inset-y-0 left-0 z-999999 flex w-64 shrink-0 -translate-x-full flex-col border-neutral-200 border-r bg-white transition-transform duration-200 data-[open=true]:translate-x-0",
					"md:sticky md:top-(--kizlo-admin-bar) md:z-auto md:h-[calc(100vh-var(--kizlo-admin-bar))] md:translate-x-0 md:transition-none",
					className,
				)}
				{...props}
			>
				{children}
			</aside>
		</>
	)
}

export function ShellMain({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return <div data-slot="shell-main" className={cn("flex min-w-0 flex-1 flex-col", className)} {...props} />
}

export function ShellHeader({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
	return (
		<header
			data-slot="shell-header"
			className={cn(
				"sticky top-(--kizlo-admin-bar) z-30 flex h-(--kizlo-header) shrink-0 items-center gap-3 border-neutral-200 border-b bg-white px-4 md:px-6",
				className,
			)}
			{...props}
		/>
	)
}

export function ShellBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return <div data-slot="shell-body" className={cn("flex min-h-0 flex-1 flex-col", className)} {...props} />
}
