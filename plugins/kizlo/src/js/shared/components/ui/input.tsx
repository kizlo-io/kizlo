import { __experimentalNumberControl as NumberControl, TextareaControl, TextControl } from "@wordpress/components"
import { cn } from "@/shared/lib/utils"

export interface BaseInputProps {
	name: string
	value?: string
	desc?: React.ReactNode
	onChange?: (value: string) => void
	label?: string
	placeholder?: string
}

export interface TextInputProps extends Omit<React.HTMLAttributes<HTMLInputElement>, "onChange">, BaseInputProps {
	type?: "text" | "password"
}

export function TextInput({ ...props }: TextInputProps) {
	return (
		<TextControl
			id={`${props.name}-text-input`}
			name={props.name}
			type={props.type}
			label={props.label}
			help={props.desc as React.ComponentProps<typeof TextControl>["help"]}
			placeholder={props.placeholder}
			value={props.value ?? ""}
			onChange={(e) => {
				props.onChange?.(e)
			}}
			__next40pxDefaultSize
			className={cn("w-full", props.className)}
		/>
	)
}

export interface TextareaInputProps extends Omit<React.HTMLAttributes<HTMLInputElement>, "onChange">, BaseInputProps {
	rows?: number
}

export function TextareaInput({ ...props }: TextareaInputProps) {
	return (
		<TextareaControl
			id={`${props.name}-textarea-input`}
			name={props.name}
			label={props.label}
			rows={props.rows}
			help={props.desc as React.ComponentProps<typeof TextareaControl>["help"]}
			placeholder={props.placeholder}
			value={props.value ?? ""}
			onChange={(e) => {
				props.onChange?.(e)
			}}
			className={cn("w-full [&_textarea]:min-h-10", props.className)}
		/>
	)
}

export interface NumberInputProps extends Omit<React.HTMLAttributes<HTMLInputElement>, "onChange">, BaseInputProps {}

export function NumberInput({ ...props }: NumberInputProps) {
	return (
		<NumberControl
			id={`${props.name}-number-input`}
			name={props.name}
			label={props.label}
			help={props.desc as React.ComponentProps<typeof NumberControl>["help"]}
			placeholder={props.placeholder}
			value={props.value ?? ""}
			onChange={(e) => {
				props.onChange?.(e ?? "")
			}}
			onKeyDown={(e) => {
				if (["e", "E", "+", "-"].includes(e.key)) {
					e.preventDefault()
				}
				props.onKeyDown?.(e)
			}}
			__next40pxDefaultSize
			className={cn("w-full", props.className)}
		/>
	)
}
