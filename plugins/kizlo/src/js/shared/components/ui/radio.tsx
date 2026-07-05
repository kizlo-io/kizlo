import type { Icon } from "@phosphor-icons/react"
import { RadioControl } from "@wordpress/components"
import { cn } from "@/shared/lib/utils"

export interface RadioOption {
	label: string
	value: string
	desc?: string
	disabled?: boolean
}

export interface RadioProps {
	name: string
	options: RadioOption[]
	value?: string
	label?: string
	desc?: string
	disabled?: boolean
	onChange?: (value: string) => void
	className?: string
}

export function Radio({ ...props }: RadioProps) {
	return (
		<RadioControl
			label={props.label}
			help={props.desc}
			selected={props.value}
			options={props.options.map((option) => ({ label: option.label, value: option.value }))}
			onChange={(value) => {
				props.onChange?.(value)
			}}
			className={cn("w-full", props.disabled && "pointer-events-none opacity-50", props.className)}
		/>
	)
}

export interface RadioCardOption extends RadioOption {
	icon?: Icon
}

export interface RadioCardsProps {
	name: string
	options: RadioCardOption[]
	value?: string
	label?: string
	desc?: string
	disabled?: boolean
	columns?: number
	onChange?: (value: string) => void
	children?: (option: RadioCardOption, selected: boolean) => React.ReactNode
	className?: string
}

export function RadioCards({ columns = 2, ...props }: RadioCardsProps) {
	return (
		<div className={cn("flex w-full flex-col gap-3", props.className)}>
			{props.label ? <span className="font-medium text-neutral-900 text-sm">{props.label}</span> : null}

			<div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
				{props.options.map((option) => {
					const selected = props.value === option.value
					const disabled = props.disabled || option.disabled
					const OptionIcon = option.icon

					return (
						<label
							key={option.value}
							className={cn(
								"group relative flex cursor-pointer flex-col gap-2 rounded-lg border border-neutral-300 bg-transparent p-4 transition-colors",
								"has-focus-visible:wp-ring hover:border-primary has-focus-visible:ring-2",
								selected && "wp-ring border-primary ring-1",
								disabled && "pointer-events-none opacity-50",
							)}
						>
							<input
								type="radio"
								name={props.name}
								value={option.value}
								checked={selected}
								disabled={disabled}
								onChange={() => props.onChange?.(option.value)}
								className="sr-only"
							/>

							{props.children ? (
								props.children(option, selected)
							) : (
								<>
									{OptionIcon ? <OptionIcon className={cn("size-6 text-neutral-500", selected && "text-primary")} weight="thin" /> : null}

									<div>
										<h3 className="my-0 font-medium text-neutral-900 text-sm">{option.label}</h3>
										{option.desc ? <p className="my-0 text-neutral-500 text-sm leading-relaxed">{option.desc}</p> : null}
									</div>
								</>
							)}
						</label>
					)
				})}
			</div>

			{props.desc ? <p className="text-neutral-500 text-sm leading-relaxed">{props.desc}</p> : null}
		</div>
	)
}
