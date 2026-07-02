import { CaretDown, Check, Copy, Eye, EyeClosed, X } from "@phosphor-icons/react"
import { useState } from "react"
import { type Control, Controller, type FieldPath, type FieldValues } from "react-hook-form"
import { toast } from "sonner"
import { useClipboard } from "@/shared/hooks/use-clipboard"
import type { Variable } from "@/shared/lib/schema"
import { cn } from "@/shared/lib/utils"
import { Badge } from "@/shared/ui/badge"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/shared/ui/command"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/shared/ui/field"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/shared/ui/input-group"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select"
import { Switch } from "@/shared/ui/switch"
import { Textarea } from "@/shared/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"

export interface BaseFieldProps<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues> {
	label: string
	name: FieldPath<TFieldValues>
	description?: React.ReactNode
	control: Control<TFieldValues, TContext, TTransformedValues>
}

// ====================================================
// TEXT
// ====================================================

interface TextInputFieldProps<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>
	extends BaseFieldProps<TFieldValues, TContext, TTransformedValues> {
	icon?: React.ReactNode
	type?: "text" | "password"
	placeholder?: string
}

export function TextInputField<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>({
	control,
	type,
	name,
	label,
	description,
	placeholder,
	icon,
}: TextInputFieldProps<TFieldValues, TContext, TTransformedValues>) {
	const [isVisible, setVisible] = useState(false)

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState }) => (
				<Field data-invalid={fieldState.invalid}>
					<FieldContent>
						<FieldLabel htmlFor={name}>{label}</FieldLabel>
						{description && <FieldDescription>{description}</FieldDescription>}
					</FieldContent>

					<InputGroup>
						<InputGroupInput
							{...field}
							id={name}
							type={isVisible ? "text" : (type ?? "text")}
							value={field.value}
							onChange={field.onChange}
							aria-invalid={fieldState.invalid}
							placeholder={placeholder}
						/>
						{type === "password" ? (
							<InputGroupAddon align="inline-end">
								<InputGroupButton onClick={() => setVisible((v) => !v)}>{isVisible ? <Eye /> : <EyeClosed />}</InputGroupButton>
							</InputGroupAddon>
						) : null}

						{icon && <InputGroupAddon align="inline-end">{icon}</InputGroupAddon>}
					</InputGroup>
					{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
				</Field>
			)}
		/>
	)
}

// ====================================================
// NUMBER
// ====================================================

interface NumberInputFieldProps<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>
	extends BaseFieldProps<TFieldValues, TContext, TTransformedValues> {
	icon?: React.ReactNode
	placeholder?: string
	decimal?: boolean
}

export function NumberInputField<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>({
	control,
	name,
	label,
	description,
	placeholder,
	icon,
	decimal = false,
}: NumberInputFieldProps<TFieldValues, TContext, TTransformedValues>) {
	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState }) => (
				<Field data-invalid={fieldState.invalid}>
					<FieldContent>
						<FieldLabel htmlFor={name}>{label}</FieldLabel>
						{description && <FieldDescription>{description}</FieldDescription>}
					</FieldContent>

					<InputGroup>
						<InputGroupInput
							{...field}
							id={name}
							type="text"
							value={field.value}
							inputMode={decimal ? "decimal" : "numeric"}
							onChange={(e) => {
								const pattern = decimal ? /[^0-9.]/g : /[^0-9]/g
								const raw = e.target.value.replace(pattern, "")
								const sanitized = decimal ? raw.replace(/^(\d*\.?\d*).*$/, "$1") : raw
								field.onChange(sanitized === "" ? "" : decimal ? sanitized : Number(sanitized))
							}}
							onKeyDown={(e) => {
								const allowed = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab", "Home", "End"]
								if (allowed.includes(e.key)) return
								if (decimal && e.key === "." && !e.currentTarget.value.includes(".")) return
								if (!/^[0-9]$/.test(e.key)) e.preventDefault()
							}}
							aria-invalid={fieldState.invalid}
							placeholder={placeholder}
						/>
						{icon && <InputGroupAddon align="inline-end">{icon}</InputGroupAddon>}
					</InputGroup>
					{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
				</Field>
			)}
		/>
	)
}

// ====================================================
// TEXTAREA
// ====================================================

interface TextareaFieldProps<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>
	extends BaseFieldProps<TFieldValues, TContext, TTransformedValues> {
	rows?: number
	placeholder?: string
}

export function TextareaField<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>({
	control,
	name,
	label,
	description,
	placeholder,
	rows = 3,
}: TextareaFieldProps<TFieldValues, TContext, TTransformedValues>) {
	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState }) => (
				<Field data-invalid={fieldState.invalid}>
					<FieldContent>
						<FieldLabel htmlFor={name}>{label}</FieldLabel>
						{description && <FieldDescription>{description}</FieldDescription>}
					</FieldContent>

					<Textarea
						{...field}
						id={name}
						rows={rows}
						value={field.value}
						onChange={field.onChange}
						aria-invalid={fieldState.invalid}
						placeholder={placeholder}
					/>

					{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
				</Field>
			)}
		/>
	)
}

// ====================================================
// SELECT
// ====================================================

export interface SelectOption {
	label: string
	value: string
}

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
	placeholder = "Select an option...",
}: SelectFieldProps<TFieldValues, TContext, TTransformedValues>) {
	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState }) => (
				<Field data-invalid={fieldState.invalid}>
					<FieldContent>
						<FieldLabel htmlFor={name}>{label}</FieldLabel>
						{description && <FieldDescription>{description}</FieldDescription>}
					</FieldContent>

					<Select value={field.value} onValueChange={field.onChange}>
						<SelectTrigger>
							<SelectValue placeholder={placeholder} />
						</SelectTrigger>

						<SelectContent position="popper" className="h-60">
							<SelectGroup>
								{options.map((item) => (
									<SelectItem key={item.value} value={item.value}>
										{item.label}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>

					{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
				</Field>
			)}
		/>
	)
}

// ====================================================
// FORMAT TOKENS
// ====================================================

export function VariableBadge({ ...token }: Variable) {
	const { copy, copied } = useClipboard({
		cb() {
			toast.success(`${token.value} is copied to clipboard.`)
		},
	})

	return (
		<Tooltip>
			<TooltipTrigger type="button">
				<Badge variant="outline" className="cursor-pointer text-xs" onClick={() => copy(token.value)}>
					{token.value} {copied ? <Check /> : <Copy />}
				</Badge>
			</TooltipTrigger>

			<TooltipContent>
				<p>{token.description}</p>
			</TooltipContent>
		</Tooltip>
	)
}

// ====================================================
// COMBOBOX
// ====================================================

export interface ComboboxOption {
	value: string
	label: string
}

interface ComboboxFieldProps<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>
	extends BaseFieldProps<TFieldValues, TContext, TTransformedValues> {
	options: ComboboxOption[]
	searchPlaceholder?: string
	emptyText?: string
	multiple?: boolean
	placeholder?: string
}

export function ComboboxField<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>({
	control,
	name,
	label,
	options,
	description,
	multiple = false,
	placeholder = "Select an option...",
	searchPlaceholder = "Search...",
	emptyText = "No results found.",
}: ComboboxFieldProps<TFieldValues, TContext, TTransformedValues>) {
	const [open, setOpen] = useState(false)

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState }) => {
				const selected = multiple ? options.filter((o) => field.value.includes(o.value)) : options.find((o) => o.value === field.value)

				function onSelect(optionValue: string) {
					if (!multiple) {
						field.onChange(optionValue)
						setOpen(false)
						return
					}
					if (field.value.includes(optionValue)) {
						field.onChange(field.value.filter((v: string) => v !== optionValue))
					} else {
						field.onChange([...field.value, optionValue])
					}
				}

				function remove(optionValue: string, e: React.MouseEvent) {
					e.stopPropagation()
					field.onChange(field.value.filter((v: string) => v !== optionValue))
				}

				return (
					<Field data-invalid={fieldState.invalid}>
						<FieldContent>
							<FieldLabel htmlFor={name}>{label}</FieldLabel>
							{description && <FieldDescription>{description}</FieldDescription>}
						</FieldContent>

						<Popover open={open} onOpenChange={setOpen}>
							<PopoverTrigger
								asChild
								aria-invalid={fieldState.invalid}
								className={cn(
									"flex min-h-9 w-full min-w-0 cursor-pointer flex-wrap items-center rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none transition-[color,box-shadow] selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
									"aria-expanded:border-ring aria-expanded:ring-[3px] aria-expanded:ring-ring/50",
									"aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
								)}
							>
								<div className="relative flex flex-wrap gap-2">
									{selected && Array.isArray(selected) && selected.length > 0 ? (
										selected.map((option) => (
											<Badge key={option.value} variant="secondary" className="gap-1 pr-1 font-normal">
												{option.label}
												<button
													type="button"
													onClick={(e) => remove(option.value, e)}
													className="rounded-full p-0.5 transition-colors hover:bg-muted-foreground/20"
													aria-label={`Remove ${option.label}`}
												>
													<X className="size-3" />
												</button>
											</Badge>
										))
									) : selected && !Array.isArray(selected) ? (
										<span>{selected.value}</span>
									) : (
										<span className="text-muted-foreground">{placeholder}</span>
									)}

									<CaretDown className="pointer-events-none absolute top-2.5 right-2.5 size-4 text-muted-foreground opacity-50" />
								</div>
							</PopoverTrigger>

							<PopoverContent className="max-h-60 w-(--radix-popover-trigger-width) p-0" align="start" collisionPadding={{ top: 400 }}>
								<Command>
									<CommandInput placeholder={searchPlaceholder} />
									<CommandList>
										<CommandEmpty>{emptyText}</CommandEmpty>
										<CommandGroup>
											{options.map((option) => {
												const isSelected = multiple ? field.value.includes(option.value) : field.value === option.value

												return (
													<CommandItem
														key={String(option.value)}
														value={option.label}
														onSelect={() => onSelect(option.value)}
														className="cursor-pointer"
													>
														{option.label}
														{isSelected && <Check className="ml-auto shrink-0" />}
													</CommandItem>
												)
											})}
										</CommandGroup>
									</CommandList>
								</Command>
							</PopoverContent>
						</Popover>

						{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
					</Field>
				)
			}}
		/>
	)
}

// ====================================================
// SWITCH
// ====================================================

interface SwitchFieldProps<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>
	extends BaseFieldProps<TFieldValues, TContext, TTransformedValues> {}

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
				<Field orientation="horizontal" data-invalid={fieldState.invalid}>
					<FieldContent>
						<FieldLabel htmlFor={name}>{label}</FieldLabel>
						<FieldDescription>{description}</FieldDescription>
					</FieldContent>

					<Switch id={name} checked={field.value} onCheckedChange={field.onChange} aria-invalid={fieldState.invalid} />
					{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
				</Field>
			)}
		/>
	)
}
