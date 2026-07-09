import { type Control, Controller, type FieldPath, type FieldValues } from "react-hook-form"
import { NumberInput, TextareaInput, TextInput } from "./ui/input"
import { Combobox, MultiSelect, Select, type SelectOption } from "./ui/select"
import { Toggle } from "./ui/toggle"

export type { SelectOption } from "./ui/select"

// RHF-aware field wrappers built on the new WP-based components. Each renders
// its own label + description (help) and surfaces validation errors below.

export interface BaseFieldProps<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues> {
	label?: string
	name: FieldPath<TFieldValues>
	description?: React.ReactNode
	control: Control<TFieldValues, TContext, TTransformedValues>
}

export function FieldError({ message }: { message?: string }) {
	if (!message) return null
	return <p className="mt-1 mb-0 text-red-600 text-sm">{message}</p>
}

// ====================================================
// TEXT
// ====================================================

interface TextInputFieldProps<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>
	extends BaseFieldProps<TFieldValues, TContext, TTransformedValues> {
	type?: "text" | "password"
	placeholder?: string
}

export function TextInputField<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>({
	control,
	name,
	label,
	type,
	description,
	placeholder,
}: TextInputFieldProps<TFieldValues, TContext, TTransformedValues>) {
	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState }) => (
				<div>
					<TextInput
						name={name}
						type={type}
						label={label}
						desc={description}
						placeholder={placeholder}
						value={field.value ?? ""}
						onChange={field.onChange}
					/>
					<FieldError message={fieldState.error?.message} />
				</div>
			)}
		/>
	)
}

// ====================================================
// TEXTAREA
// ====================================================

interface TextareaInputFieldProps<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>
	extends BaseFieldProps<TFieldValues, TContext, TTransformedValues> {
	placeholder?: string
}

export function TextareaInputField<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>({
	control,
	name,
	label,
	description,
	placeholder,
}: TextareaInputFieldProps<TFieldValues, TContext, TTransformedValues>) {
	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState }) => (
				<div>
					<TextareaInput
						name={name}
						label={label}
						desc={description}
						placeholder={placeholder}
						value={field.value ?? ""}
						onChange={field.onChange}
					/>
					<FieldError message={fieldState.error?.message} />
				</div>
			)}
		/>
	)
}

// ====================================================
// NUMBER
// ====================================================

interface NumberInputFieldProps<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>
	extends BaseFieldProps<TFieldValues, TContext, TTransformedValues> {
	placeholder?: string
}

export function NumberInputField<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>({
	control,
	name,
	label,
	description,
	placeholder,
}: NumberInputFieldProps<TFieldValues, TContext, TTransformedValues>) {
	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState }) => (
				<div>
					<NumberInput
						name={name}
						label={label}
						desc={description}
						placeholder={placeholder}
						value={field.value == null ? "" : String(field.value)}
						onChange={(value) => field.onChange(value === "" ? null : Number(value))}
					/>
					<FieldError message={fieldState.error?.message} />
				</div>
			)}
		/>
	)
}

// ====================================================
// SELECT
// ====================================================

interface SelectFieldProps<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>
	extends BaseFieldProps<TFieldValues, TContext, TTransformedValues> {
	options: SelectOption[]
	placeholder?: string
}

export function SelectField<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>({
	control,
	name,
	label,
	options,
	description,
	placeholder,
}: SelectFieldProps<TFieldValues, TContext, TTransformedValues>) {
	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState }) => (
				<div>
					<Select
						name={name}
						label={label}
						desc={description}
						options={options}
						placeholder={placeholder}
						value={field.value ?? ""}
						onChange={field.onChange}
					/>
					<FieldError message={fieldState.error?.message} />
				</div>
			)}
		/>
	)
}

// ====================================================
// COMBOBOX
// ====================================================

interface ComboboxFieldProps<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>
	extends BaseFieldProps<TFieldValues, TContext, TTransformedValues> {
	options: SelectOption[]
	placeholder?: string
	multiple?: boolean
}

export function ComboboxField<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>({
	control,
	name,
	label,
	options,
	description,
	placeholder,
	multiple = false,
}: ComboboxFieldProps<TFieldValues, TContext, TTransformedValues>) {
	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState }) => (
				<div>
					{multiple ? (
						<MultiSelect
							name={name}
							label={label}
							desc={description}
							options={options}
							placeholder={placeholder}
							value={field.value ?? []}
							onChange={field.onChange}
						/>
					) : (
						<Combobox
							name={name}
							label={label}
							desc={description}
							options={options}
							placeholder={placeholder}
							allowReset={false}
							value={field.value ?? ""}
							onChange={(value) => field.onChange(value ?? "")}
						/>
					)}
					<FieldError message={fieldState.error?.message} />
				</div>
			)}
		/>
	)
}

// ====================================================
// SWITCH
// ====================================================

type SwitchFieldProps<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues> = BaseFieldProps<
	TFieldValues,
	TContext,
	TTransformedValues
>

export function SwitchField<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>({
	control,
	name,
	label,
	description,
}: SwitchFieldProps<TFieldValues, TContext, TTransformedValues>) {
	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState }) => (
				<div>
					<Toggle name={name} label={label} desc={description} checked={field.value ?? false} onChange={field.onChange} />
					<FieldError message={fieldState.error?.message} />
				</div>
			)}
		/>
	)
}
