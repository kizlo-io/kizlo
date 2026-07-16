import { EyeIcon, EyeSlashIcon } from "@phosphor-icons/react"
import { BaseControl, __experimentalNumberControl as NumberControl, TextareaControl, TextControl } from "@wordpress/components"
import { useState } from "react"
import { cn } from "@/shared/lib/utils"
import { Button } from "./button"

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

export interface PasswordInputProps extends Omit<React.HTMLAttributes<HTMLInputElement>, "onChange">, BaseInputProps {}

// Rendered as a masked `type="text"` input rather than `type="password"` so the
// browser never treats it as a credential field — this stops the "save password"
// prompt and autofill for a value that is a shared secret, not a login. The eye
// button toggles the CSS masking so the secret can be read back when needed.
export function PasswordInput({ ...props }: PasswordInputProps) {
	const [visible, setVisible] = useState(false)
	const id = `${props.name}-password-input`

	return (
		<BaseControl id={id} label={props.label} help={props.desc as React.ComponentProps<typeof BaseControl>["help"]} __nextHasNoMarginBottom>
			<div className="relative">
				<input
					id={id}
					name={props.name}
					type="text"
					autoComplete="off"
					autoCorrect="off"
					autoCapitalize="off"
					spellCheck={false}
					value={props.value ?? ""}
					placeholder={props.placeholder}
					onChange={(e) => props.onChange?.(e.target.value)}
					className={cn(
						"components-text-control__input is-next-40px-default-size w-full pr-10",
						!visible && "[-webkit-text-security:disc]",
						props.className,
					)}
				/>
				<Button
					type="button"
					variant="secondary"
					onClick={() => setVisible((v) => !v)}
					aria-label={visible ? "Hide secret" : "Show secret"}
					className="absolute inset-y-0 right-0"
				>
					{visible ? <EyeSlashIcon className="size-5" /> : <EyeIcon className="size-5" />}
				</Button>
			</div>
		</BaseControl>
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
