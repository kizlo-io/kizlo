import { type Control, Controller, type FieldPath, type FieldValues } from "react-hook-form"
import { ColorInput } from "./ui/color"
import { type FieldDescMode, FieldLabel } from "./ui/field-label"
import { NumberInput, PasswordInput, TextareaInput, TextInput } from "./ui/input"
import { MediaPicker } from "./ui/media-picker"
import { RichTextInput } from "./ui/rich-text"
import { Combobox, MultiSelect, Select, type SelectOption } from "./ui/select"
import { Toggle } from "./ui/toggle"

export type { SelectOption } from "./ui/select"

export interface BaseFieldProps<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues> {
	label?: string
	name: FieldPath<TFieldValues>
	description?: React.ReactNode
	descMode?: FieldDescMode
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
	descMode,
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
						descMode={descMode}
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
// PASSWORD
// ====================================================

interface PasswordInputFieldProps<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>
	extends BaseFieldProps<TFieldValues, TContext, TTransformedValues> {
	placeholder?: string
}

export function PasswordInputField<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>({
	control,
	name,
	label,
	description,
	descMode,
	placeholder,
}: PasswordInputFieldProps<TFieldValues, TContext, TTransformedValues>) {
	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState }) => (
				<div>
					<PasswordInput
						name={name}
						label={label}
						desc={description}
						descMode={descMode}
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
	descMode,
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
						descMode={descMode}
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
	descMode,
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
						descMode={descMode}
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
	descMode,
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
						descMode={descMode}
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
	descMode,
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
							descMode={descMode}
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
							descMode={descMode}
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

interface SwitchFieldProps<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>
	extends BaseFieldProps<TFieldValues, TContext, TTransformedValues> {
	disabled?: boolean
}

export function SwitchField<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>({
	control,
	name,
	label,
	description,
	descMode = "below",
	disabled,
}: SwitchFieldProps<TFieldValues, TContext, TTransformedValues>) {
	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState }) => (
				<div>
					<div className="flex items-center justify-between gap-4">
						<FieldLabel label={label} desc={description} descMode={descMode} />
						<Toggle name={name} label={label} hideLabel disabled={disabled} checked={field.value ?? false} onChange={field.onChange} />
					</div>
					<FieldError message={fieldState.error?.message} />
				</div>
			)}
		/>
	)
}

// ====================================================
// EMAIL / URL / DATE
// ====================================================

interface TypedTextFieldProps<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>
	extends BaseFieldProps<TFieldValues, TContext, TTransformedValues> {
	placeholder?: string
}

function makeTypedTextField(type: "email" | "url" | "date") {
	return function TypedTextField<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>({
		control,
		name,
		label,
		description,
		descMode,
		placeholder,
	}: TypedTextFieldProps<TFieldValues, TContext, TTransformedValues>) {
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
							descMode={descMode}
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
}

export const EmailField = makeTypedTextField("email")
export const UrlField = makeTypedTextField("url")
export const DateField = makeTypedTextField("date")

// ====================================================
// RICH TEXT
// ====================================================

interface RichTextFieldProps<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>
	extends BaseFieldProps<TFieldValues, TContext, TTransformedValues> {
	placeholder?: string
}

export function RichTextField<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>({
	control,
	name,
	label,
	description,
	descMode,
	placeholder,
}: RichTextFieldProps<TFieldValues, TContext, TTransformedValues>) {
	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState }) => (
				<div>
					<RichTextInput
						name={name}
						label={label}
						desc={description}
						descMode={descMode}
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
// MEDIA (image / file)
// ====================================================

/** Form value for a media field: the attachment id plus a preview url. */
export interface MediaFieldValue {
	id: number
	url?: string
	src?: string
}

interface MediaFieldProps<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>
	extends BaseFieldProps<TFieldValues, TContext, TTransformedValues> {
	mediaType: "image" | "application"
}

export function MediaField<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>({
	control,
	name,
	label,
	description,
	descMode,
	mediaType,
}: MediaFieldProps<TFieldValues, TContext, TTransformedValues>) {
	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState }) => {
				const value = field.value as MediaFieldValue | null | undefined
				return (
					<div>
						<MediaPicker
							type={mediaType}
							label={label ?? ""}
							desc={description}
							descMode={descMode}
							value={value?.id ?? null}
							url={value?.src ?? value?.url}
							onValueChange={(item) => field.onChange(item ? { id: item.id, url: item.url } : null)}
						/>
						<FieldError message={fieldState.error?.message} />
					</div>
				)
			}}
		/>
	)
}

// ====================================================
// COLOR
// ====================================================

interface ColorFieldProps<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>
	extends BaseFieldProps<TFieldValues, TContext, TTransformedValues> {
	placeholder?: string
}

export function ColorField<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>({
	control,
	name,
	label,
	description,
	descMode,
	placeholder,
}: ColorFieldProps<TFieldValues, TContext, TTransformedValues>) {
	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState }) => (
				<div>
					<ColorInput
						name={name}
						label={label}
						desc={description}
						descMode={descMode}
						placeholder={placeholder}
						value={field.value ?? ""}
						onChange={(value) => field.onChange(value || null)}
					/>
					<FieldError message={fieldState.error?.message} />
				</div>
			)}
		/>
	)
}
