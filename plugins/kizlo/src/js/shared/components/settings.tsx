import { CaretDownIcon, ListIcon, MagnifyingGlassIcon, SpinnerGapIcon } from "@phosphor-icons/react"
import { useState } from "react"
import { $search, $sidebar } from "@/shared/lib/store"
import { cn } from "@/shared/lib/utils"
import { Button } from "./ui/button"
import { Card, CardContent } from "./ui/card"
import { FieldLabel } from "./ui/field-label"

interface SettingsFormProps extends React.FormHTMLAttributes<HTMLFormElement> {
	isLoading?: boolean
	isDirty?: boolean
	submitLabel?: string
	/** Revert unsaved changes. Wired to the mobile island's Cancel button. */
	onCancel?: () => void
}

function IslandIconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
	return (
		<button
			type="button"
			aria-label={label}
			onClick={onClick}
			className="flex size-10 w-full cursor-pointer appearance-none items-center justify-center not-first:rounded-r-full border-0 bg-transparent p-0 text-neutral-600 transition-colors first:rounded-l-full hover:bg-neutral-100 hover:text-neutral-900"
		>
			{children}
		</button>
	)
}

export function SettingsForm({ isLoading, isDirty, submitLabel = "Update", onCancel, className, children, ...props }: SettingsFormProps) {
	const active = isDirty || isLoading

	return (
		<form className={cn("flex flex-1 flex-col", className)} {...props}>
			<div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-14 p-4 pb-24 md:px-6 md:pt-10">{children}</div>

			<div
				className={cn(
					"sticky inset-x-0 bottom-0 z-0 hidden transition-[grid-template-rows] duration-300 ease-out md:grid",
					active ? "grid-rows-[1fr]" : "pointer-events-none grid-rows-[0fr]",
				)}
			>
				<div className="overflow-hidden">
					<div
						className={cn(
							"flex w-full min-w-0 items-end justify-end gap-2 border-neutral-200 border-t bg-white px-4 py-3 transition-all duration-300 ease-out md:px-6",
							active ? "translate-y-0 opacity-100" : "translate-y-full opacity-0",
						)}
					>
						<Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isLoading}>
							Cancel
						</Button>

						<Button type="submit" size="sm" disabled={isLoading}>
							{isLoading ? <SpinnerGapIcon className="size-4 animate-spin" /> : null}
							{submitLabel}
						</Button>
					</div>
				</div>
			</div>

			<div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] md:hidden">
				<div className="pointer-events-auto grid items-center overflow-hidden rounded-full border border-neutral-200 bg-white/90 p-1 shadow-lg backdrop-blur-sm">
					<div
						className={cn(
							"col-start-1 row-start-1 flex items-center justify-center gap-1 transition-all duration-300 ease-out",
							active ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0",
						)}
					>
						<Button type="button" variant="ghost" onClick={onCancel} disabled={isLoading} className="rounded-full">
							Cancel
						</Button>
						<Button type="submit" disabled={isLoading} className="rounded-full">
							{isLoading ? <SpinnerGapIcon className="size-4 animate-spin" /> : null}
							{submitLabel}
						</Button>
					</div>

					<div
						className={cn(
							"col-start-1 row-start-1 flex items-center justify-between transition-all duration-200 ease-out",
							active ? "pointer-events-none -translate-y-full opacity-0" : "translate-y-0 opacity-100",
						)}
					>
						<IslandIconButton label="Search settings" onClick={() => $search.set(true)}>
							<MagnifyingGlassIcon className="size-5" />
						</IslandIconButton>

						<div className="h-5 w-px border-neutral-300 border-r"></div>

						<IslandIconButton label="Open menu" onClick={() => $sidebar.set(true)}>
							<ListIcon className="size-5" />
						</IslandIconButton>
					</div>
				</div>
			</div>
		</form>
	)
}

/**
 * A titled block of settings. Renders the heading/description once, then stacks
 * one or more {@link SettingsCard}s beneath it — use several cards to cluster
 * related fields under a single heading without giving each cluster its own
 * top-level title.
 */
export function SettingsGroup({
	id,
	title,
	desc,
	children,
}: {
	/** Anchor id for the sidebar's section jump-links. */
	id?: string
	title: React.ReactNode
	desc?: React.ReactNode
	children: React.ReactNode
}) {
	return (
		<section id={id} className={cn("flex scroll-mt-[calc(var(--kizlo-admin-bar)+var(--kizlo-header)+1rem)] flex-col gap-4")}>
			<div className="flex flex-col gap-1">
				<h2 className={cn("m-0! p-0! font-semibold! text-base! text-neutral-900! transition-colors duration-500")}>{title}</h2>
				{desc ? <p className="my-0! text-neutral-500! text-sm! leading-relaxed!">{desc}</p> : null}
			</div>

			{children}
		</section>
	)
}

export function SettingsCard({ children }: { children: React.ReactNode }) {
	return (
		<Card>
			<CardContent className="flex flex-col gap-6 p-6!">{children}</CardContent>
		</Card>
	)
}

/**
 * A {@link SettingsCard} whose body is hidden behind a header toggle. Use for a
 * cluster of secondary fields that would otherwise crowd a section — the header
 * carries the label/description; the fields reveal on expand.
 */
export function SettingsCollapsibleCard({
	title,
	description,
	defaultOpen = false,
	children,
}: {
	title: React.ReactNode
	description?: React.ReactNode
	defaultOpen?: boolean
	children: React.ReactNode
}) {
	const [open, setOpen] = useState(defaultOpen)

	return (
		<Card aria-expanded={open} className="group">
			<button
				type="button"
				onClick={() => setOpen((value) => !value)}
				className="flex w-full cursor-pointer items-center justify-between gap-3 border-0 bg-transparent p-6 pr-8 text-left"
			>
				<FieldLabel label={title} desc={description} descMode="below" />

				<CaretDownIcon data-open className="size-4 transition-transform group-aria-expanded:rotate-180" />
			</button>

			{open ? <CardContent className="flex flex-col gap-6 rounded-none! border-neutral-200 border-t p-6!">{children}</CardContent> : null}
		</Card>
	)
}

export function SettingsSection({
	id,
	title,
	desc,
	children,
}: {
	id?: string
	title: React.ReactNode
	desc?: React.ReactNode
	children: React.ReactNode
}) {
	return (
		<SettingsGroup id={id} title={title} desc={desc}>
			<SettingsCard>{children}</SettingsCard>
		</SettingsGroup>
	)
}
