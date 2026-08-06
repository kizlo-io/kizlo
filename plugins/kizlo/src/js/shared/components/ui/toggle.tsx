import { ToggleControl } from "@wordpress/components"
import { cn } from "@/shared/lib/utils"
import { type FieldDescMode, FieldLabel } from "./field-label"

export interface ToggleProps extends Omit<React.HTMLAttributes<HTMLElement>, "onChange"> {
	name: string
	checked?: boolean
	desc?: React.ReactNode
	descMode?: FieldDescMode
	onChange?: (checked: boolean) => void
	label?: string
	disabled?: boolean
	togglePosition?: "start" | "end"
	/** Render only the switch (label kept for screen readers). Used when the label is supplied separately, e.g. via FieldLabel. */
	hideLabel?: boolean
}

export function Toggle({ togglePosition = "end", hideLabel = false, ...props }: ToggleProps) {
	return (
		<ToggleControl
			label={
				(hideLabel ? (
					<span className="sr-only">{props.label}</span>
				) : (
					<FieldLabel label={props.label} desc={props.desc} descMode={props.descMode} />
				)) as React.ComponentProps<typeof ToggleControl>["label"]
			}
			name={props.name}
			checked={props.checked ?? false}
			disabled={props.disabled}
			onChange={(checked) => {
				props.onChange?.(checked)
			}}
			className={cn(
				!hideLabel && "w-full",
				!hideLabel &&
					togglePosition === "end" &&
					"[&_.components-h-stack]:w-full [&_.components-h-stack]:flex-row-reverse [&_.components-h-stack]:justify-between [&_span]:ms-0!",
				props.className,
			)}
		/>
	)
}
