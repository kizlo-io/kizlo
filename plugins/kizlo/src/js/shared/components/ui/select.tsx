import { ComboboxControl, FormTokenField, SelectControl } from "@wordpress/components"
import { useMemo } from "react"
import { cn } from "@/shared/lib/utils"

export interface SelectOption {
	label: string
	value: string
	disabled?: boolean
}

export interface BaseSelectProps {
	name: string
	options: SelectOption[]
	value?: string
	desc?: React.ReactNode
	label?: string
	disabled?: boolean
	className?: string
}

export interface SelectProps extends BaseSelectProps {
	placeholder?: string
	onChange?: (value: string) => void
}

export function Select({ ...props }: SelectProps) {
	return (
		<SelectControl
			id={`${props.name}-select`}
			label={props.label}
			help={props.desc as React.ComponentProps<typeof SelectControl>["help"]}
			value={props.value ?? ""}
			disabled={props.disabled}
			options={props.placeholder ? [{ label: props.placeholder, value: "", disabled: true }, ...props.options] : props.options}
			onChange={(value) => {
				props.onChange?.(value)
			}}
			__next40pxDefaultSize
			className={cn("w-full", props.className)}
		/>
	)
}

export interface ComboboxProps extends BaseSelectProps {
	placeholder?: string
	allowReset?: boolean
	onChange?: (value: string | null) => void
	onFilterValueChange?: (value: string) => void
}

export function Combobox({ allowReset = true, ...props }: ComboboxProps) {
	return (
		<ComboboxControl
			label={props.label ?? ""}
			help={props.desc as React.ComponentProps<typeof ComboboxControl>["help"]}
			value={props.value}
			options={props.options}
			placeholder={props.placeholder}
			allowReset={allowReset}
			onChange={(value) => {
				props.onChange?.(value ?? null)
			}}
			onFilterValueChange={props.onFilterValueChange}
			__next40pxDefaultSize
			className={cn("kizlo-combobox w-full [&_.components-flex-item]:h-full", props.className)}
		/>
	)
}

export interface MultiSelectProps extends Omit<BaseSelectProps, "value"> {
	value?: string[]
	placeholder?: string
	maxLength?: number
	onChange?: (values: string[]) => void
}

export function MultiSelect({ ...props }: MultiSelectProps) {
	const { byValue, byLabel, suggestions } = useMemo(() => {
		const byValue: Record<string, string> = {}
		const byLabel: Record<string, string> = {}
		for (const option of props.options) {
			byValue[option.value] = option.label
			byLabel[option.label] = option.value
		}
		return { byValue, byLabel, suggestions: props.options.map((option) => option.label) }
	}, [props.options])

	return (
		<div className={cn("kizlo-multiselect w-full", props.className)}>
			<FormTokenField
				label={props.label}
				placeholder={props.placeholder}
				disabled={props.disabled}
				maxLength={props.maxLength}
				value={(props.value ?? []).map((value) => byValue[value]).filter((label): label is string => Boolean(label))}
				suggestions={suggestions}
				onChange={(tokens) => {
					props.onChange?.(
						tokens
							.map((token) => (typeof token === "string" ? byLabel[token] : byLabel[token.value]))
							.filter((value): value is string => Boolean(value)),
					)
				}}
				__experimentalValidateInput={(input) => input in byLabel}
				__experimentalExpandOnFocus
				__experimentalShowHowTo={false}
				__next40pxDefaultSize
			/>

			{props.desc ? <p className="components-base-control__help mt-2 mb-0!">{props.desc}</p> : null}
		</div>
	)
}
