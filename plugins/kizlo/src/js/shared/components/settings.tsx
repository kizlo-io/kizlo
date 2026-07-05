import { SpinnerGapIcon } from "@phosphor-icons/react"
import { cn } from "@/shared/lib/utils"
import { Button } from "./ui/button"
import { Card, CardContent } from "./ui/card"

interface SettingsFormProps extends React.FormHTMLAttributes<HTMLFormElement> {
	isLoading?: boolean
	/** Show the sticky submit bar only when the form has unsaved changes. */
	isDirty?: boolean
	submitLabel?: string
}

// Page shell for a settings form: a centered column of sections that fills the
// viewport, plus a sticky footer bar (shown while dirty) holding the submit
// button. The form flexes to full height so `sticky bottom-0` pins the bar to
// the bottom of the viewport even when the content is short.
export function SettingsForm({ isLoading, isDirty, submitLabel = "Update", className, children, ...props }: SettingsFormProps) {
	return (
		<form className={cn("flex flex-1 flex-col", className)} {...props}>
			<div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-4 pb-24 md:px-6 md:pt-10">{children}</div>

			{/* Kept mounted (not conditionally rendered) so it can transition in/out. */}
			<div
				className={cn(
					"sticky bottom-0 z-40 flex justify-end border-neutral-200 border-t bg-white px-4 py-3 transition-all duration-300 ease-out md:px-6",
					isDirty || isLoading ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0",
				)}
			>
				<Button type="submit" size="sm" disabled={isLoading}>
					{isLoading ? <SpinnerGapIcon className="size-4 animate-spin" /> : null}
					{submitLabel}
				</Button>
			</div>
		</form>
	)
}

export function SettingsSection({ title, desc, children }: { title: React.ReactNode; desc?: React.ReactNode; children: React.ReactNode }) {
	return (
		<section className="flex flex-col gap-4">
			<div className="flex flex-col gap-1">
				<h2 className="my-0 font-semibold text-base text-neutral-900">{title}</h2>
				{desc ? <p className="my-0 text-neutral-500 text-sm leading-relaxed">{desc}</p> : null}
			</div>

			<Card>
				<CardContent className="flex flex-col gap-6 p-6!">{children}</CardContent>
			</Card>
		</section>
	)
}
