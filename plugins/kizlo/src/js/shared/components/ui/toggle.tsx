import { ToggleControl } from "@wordpress/components"
import { cn } from "@/shared/lib/utils"

export interface ToggleProps extends Omit<React.HTMLAttributes<HTMLElement>, "onChange"> {
	name: string
	checked?: boolean
	desc?: React.ReactNode
	onChange?: (checked: boolean) => void
	label?: string
	disabled?: boolean
	togglePosition?: "start" | "end"
}

export function Toggle({ togglePosition = "end", ...props }: ToggleProps) {
	return (
		<ToggleControl
			label={props.label}
			name={props.name}
			help={props.desc as React.ComponentProps<typeof ToggleControl>["help"]}
			checked={props.checked ?? false}
			disabled={props.disabled}
			onChange={(checked) => {
				props.onChange?.(checked)
			}}
			className={cn(
				"w-full",
				togglePosition === "end" &&
					"[&_.components-h-stack]:w-full [&_.components-h-stack]:flex-row-reverse [&_.components-h-stack]:justify-between [&_span]:ms-0!",
				props.className,
			)}
		/>
	)
}
