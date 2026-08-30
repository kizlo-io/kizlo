import type { CustomFieldDefinition, CustomFieldType } from "@kizlo/shared"
import { ArrowDownIcon, ArrowUpIcon, CaretDownIcon, CaretRightIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react"
import { useEffect, useState } from "react"
import { type Control, type FieldPath, type FieldValues, get, useController, useFieldArray, useFormState, useWatch } from "react-hook-form"
import {
	ComboboxField,
	NumberInputField,
	RichTextField,
	SelectField,
	SwitchField,
	TextareaInputField,
	TextInputField,
} from "@/shared/components/fields"
import { Button } from "@/shared/components/ui/button"
import { cn } from "@/shared/lib/utils"
import { changeDefinitionType, newDefinition, persistedDefinitionKeys } from "./definition"

const TYPE_OPTIONS: { value: CustomFieldType; label: string }[] = [
	{ value: "text", label: "Text" },
	{ value: "textarea", label: "Text area" },
	{ value: "richtext", label: "Rich text" },
	{ value: "number", label: "Number" },
	{ value: "toggle", label: "Toggle" },
	{ value: "select", label: "Select" },
	{ value: "multiselect", label: "Multi-select" },
	{ value: "url", label: "URL" },
	{ value: "email", label: "Email" },
	{ value: "date", label: "Date" },
	{ value: "image", label: "Image" },
	{ value: "file", label: "File" },
	{ value: "group", label: "Group" },
	{ value: "repeater", label: "Repeater" },
]

const CHOICE_TYPES: CustomFieldType[] = ["select", "multiselect"]

/**
 * The custom-field definition builder for a settings form. Delegates to the
 * recursive {@link BuilderList}; the generic wrapper keeps the call site typed to
 * the form while the recursion works against a loose control (dynamic paths).
 */
export function CustomFieldsBuilder<TInput extends FieldValues, TContext, TOutput extends FieldValues>({
	control,
	name,
}: {
	control: Control<TInput, TContext, TOutput>
	name: FieldPath<TInput>
}) {
	const looseControl = control as unknown as Control<any>
	const { defaultValues } = useFormState({ control: looseControl, name })
	const persistedDefinitions = get(defaultValues, name) as CustomFieldDefinition[] | undefined
	const persistedKeys = persistedDefinitionKeys(persistedDefinitions)

	return <BuilderList control={looseControl} name={name} persistedKeys={persistedKeys} />
}

/**
 * One field-array level. Groups and repeaters render another BuilderList for their
 * children. Reordering uses the arrow convention shared with the breadcrumbs
 * builder; the server re-validates names, key length and safe type changes on save.
 */
function BuilderList({ control, name, persistedKeys }: { control: Control<any>; name: string; persistedKeys: ReadonlySet<string> }) {
	const { fields, append, remove, move, update } = useFieldArray({ control, name })
	const values = useWatch({ control, name }) as CustomFieldDefinition[] | undefined
	const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set())

	function addField() {
		const definition = newDefinition()
		setOpenKeys((keys) => new Set(keys).add(definition.key))
		append(definition)
	}

	return (
		<div className="flex flex-col gap-3">
			{fields.map((field, index) => {
				const key = (field as unknown as { key: string }).key
				const definition = values?.[index] ?? (field as unknown as CustomFieldDefinition)
				const isNew = !persistedKeys.has(key)
				return (
					<FieldCard
						key={field.id}
						control={control}
						base={`${name}.${index}`}
						defaultOpen={openKeys.has(key)}
						isNew={isNew}
						persistedKeys={persistedKeys}
						isFirst={index === 0}
						isLast={index === fields.length - 1}
						onMoveUp={() => move(index, index - 1)}
						onMoveDown={() => move(index, index + 1)}
						onRemove={() => remove(index)}
						onTypeChange={(type) => {
							setOpenKeys((keys) => new Set(keys).add(key))
							update(index, changeDefinitionType(definition, type))
						}}
					/>
				)
			})}

			<button
				type="button"
				className="flex h-12 w-full cursor-pointer items-center gap-2 rounded-xs border border-neutral-200 border-dashed bg-white px-3 py-2 hover:border-solid"
				onClick={addField}
			>
				<PlusIcon className="size-4" /> Add Field
			</button>
		</div>
	)
}

interface FieldCardProps {
	control: Control<any>
	base: string
	defaultOpen: boolean
	isNew: boolean
	persistedKeys: ReadonlySet<string>
	isFirst: boolean
	isLast: boolean
	onMoveUp: () => void
	onMoveDown: () => void
	onRemove: () => void
	onTypeChange: (type: CustomFieldType) => void
}

function FieldCard({
	control,
	base,
	defaultOpen,
	isNew,
	persistedKeys,
	isFirst,
	isLast,
	onMoveUp,
	onMoveDown,
	onRemove,
	onTypeChange,
}: FieldCardProps) {
	const [open, setOpen] = useState(defaultOpen)
	const { errors } = useFormState({ control, name: base })
	const type = useWatch({ control, name: `${base}.type` }) as CustomFieldType
	const label = useWatch({ control, name: `${base}.label` }) as string
	const fieldName = useWatch({ control, name: `${base}.name` }) as string

	const typeLabel = TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type

	useEffect(() => {
		if (get(errors, base)) setOpen(true)
	}, [base, errors])

	return (
		<div className="rounded-xs border border-neutral-200 bg-white">
			<div className="flex w-full min-w-0 flex-1 items-center gap-2 px-3 py-2">
				<button
					className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left"
					type="button"
					aria-label={open ? "Collapse" : "Expand"}
					onClick={() => setOpen((value) => !value)}
				>
					<span className="flex size-6 shrink-0 items-center justify-center text-neutral-500">
						{open ? <CaretDownIcon className="size-4" /> : <CaretRightIcon className="size-4" />}
					</span>
					<span className="min-w-0 flex-1">
						<span className="text-sm">{label || fieldName || "Untitled field"}</span>
						<span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-500 text-xs">{typeLabel}</span>
					</span>
				</button>

				<IconButton
					title="Move up"
					disabled={isFirst}
					onClick={(e) => {
						e.stopPropagation()
						onMoveUp()
					}}
				>
					<ArrowUpIcon className="size-4" />
				</IconButton>
				<IconButton
					title="Move down"
					disabled={isLast}
					onClick={(e) => {
						e.stopPropagation()
						onMoveDown()
					}}
				>
					<ArrowDownIcon className="size-4" />
				</IconButton>
				<IconButton
					title="Remove field"
					onClick={(e) => {
						e.stopPropagation()
						onRemove()
					}}
				>
					<TrashIcon className="size-4" />
				</IconButton>
			</div>

			{open ? (
				<div className="flex flex-col gap-4 border-neutral-200 border-t p-4">
					<div className="grid gap-4 md:grid-cols-2">
						<TextInputField control={control} name={`${base}.label`} label="Label" />
						<TextInputField
							control={control}
							name={`${base}.name`}
							label="Name"
							disabled={!isNew}
							description="Storage key segment. Locked after the first save."
						/>
					</div>

					<ComboboxField
						control={control}
						name={`${base}.type`}
						label="Type"
						options={TYPE_OPTIONS}
						onValueChange={(value) => onTypeChange(value as CustomFieldType)}
					/>

					<TextInputField control={control} name={`${base}.instructions`} label="Instructions" />

					<TypeConfig control={control} base={base} type={type} persistedKeys={persistedKeys} />

					<SwitchField control={control} name={`${base}.required`} label="Required" />
				</div>
			) : null}
		</div>
	)
}

function TypeConfig({
	control,
	base,
	type,
	persistedKeys,
}: {
	control: Control<any>
	base: string
	type: CustomFieldType
	persistedKeys: ReadonlySet<string>
}) {
	const rawChoices = useWatch({ control, name: `${base}.choices` }) as { value: string; label: string }[] | undefined
	const min = useWatch({ control, name: `${base}.min` }) as number | null | undefined
	const max = useWatch({ control, name: `${base}.max` }) as number | null | undefined
	const step = useWatch({ control, name: `${base}.step` }) as number | null | undefined
	const defaultField = useController({ control, name: `${base}.default` }).field
	const choiceOptions = (rawChoices ?? [])
		.filter((choice) => choice?.value)
		.map((choice) => ({ value: choice.value, label: choice.label || choice.value }))

	useEffect(() => {
		const allowed = new Set(choiceOptions.map((choice) => choice.value))
		if (type === "select" && typeof defaultField.value === "string" && defaultField.value !== "" && !allowed.has(defaultField.value)) {
			defaultField.onChange(null)
		}
		if (type === "multiselect") {
			const current = Array.isArray(defaultField.value) ? defaultField.value : []
			const next = current.filter((value): value is string => typeof value === "string" && allowed.has(value))
			if (next.length !== current.length) defaultField.onChange(next)
		}
	}, [choiceOptions, defaultField, type])

	return (
		<div className="flex flex-col gap-4">
			{CHOICE_TYPES.includes(type) ? <ChoicesEditor control={control} name={`${base}.choices`} /> : null}

			{type === "number" ? (
				<div className="grid gap-4 md:grid-cols-3">
					<NumberInputField control={control} name={`${base}.min`} label="Min" />
					<NumberInputField control={control} name={`${base}.max`} label="Max" />
					<NumberInputField control={control} name={`${base}.step`} label="Step" />
				</div>
			) : null}

			{type === "repeater" ? (
				<>
					<div className="grid gap-4 md:grid-cols-2">
						<NumberInputField control={control} name={`${base}.min`} label="Min rows" min={0} step={1} />
						<NumberInputField control={control} name={`${base}.max`} label="Max rows" min={0} step={1} />
					</div>
					<NestedFields control={control} base={base} persistedKeys={persistedKeys} />
				</>
			) : null}

			{type === "group" ? <NestedFields control={control} base={base} persistedKeys={persistedKeys} /> : null}

			<DefaultValueField control={control} base={base} type={type} choiceOptions={choiceOptions} min={min} max={max} step={step} />
		</div>
	)
}

function DefaultValueField({
	control,
	base,
	type,
	choiceOptions,
	min,
	max,
	step,
}: {
	control: Control<any>
	base: string
	type: CustomFieldType
	choiceOptions: { value: string; label: string }[]
	min?: number | null
	max?: number | null
	step?: number | null
}) {
	const name = `${base}.default`
	const label = "Default value"

	switch (type) {
		case "text":
		case "url":
		case "email":
		case "date":
			return <TextInputField control={control} name={name} label={label} />
		case "textarea":
			return <TextareaInputField control={control} name={name} label={label} />
		case "richtext":
			return <RichTextField control={control} name={name} label={label} />
		case "number":
			return (
				<NumberInputField
					control={control}
					name={name}
					label={label}
					min={min ?? undefined}
					max={max ?? undefined}
					step={step ?? undefined}
				/>
			)
		case "toggle":
			return <SwitchField control={control} name={name} label={label} />
		case "select":
			return <SelectField allowEmpty control={control} name={name} label={label} options={choiceOptions} placeholder="No default" />
		case "multiselect":
			return <ComboboxField multiple control={control} name={name} label={label} options={choiceOptions} />
		default:
			return null
	}
}

function NestedFields({ control, base, persistedKeys }: { control: Control<any>; base: string; persistedKeys: ReadonlySet<string> }) {
	return (
		<div className="rounded-xs border border-neutral-200 border-dashed bg-neutral-50/50 p-3">
			<BuilderList control={control} name={`${base}.fields`} persistedKeys={persistedKeys} />
		</div>
	)
}

function ChoicesEditor({ control, name }: { control: Control<any>; name: string }) {
	const { fields, append, remove } = useFieldArray({ control, name })

	return (
		<div className="flex flex-col gap-2">
			<p className="m-0 font-medium text-neutral-500 text-xs uppercase tracking-wide">Choices</p>

			{fields.map((field, index) => (
				<div key={field.id} className="flex items-end gap-2">
					<div className="flex-1">
						<TextInputField control={control} name={`${name}.${index}.value`} label={index === 0 ? "Value" : undefined} />
					</div>
					<div className="flex-1">
						<TextInputField control={control} name={`${name}.${index}.label`} label={index === 0 ? "Label" : undefined} />
					</div>
					<IconButton title="Remove choice" onClick={() => remove(index)}>
						<TrashIcon className="size-4" />
					</IconButton>
				</div>
			))}

			<div>
				<Button type="button" variant="secondary" size="sm" onClick={() => append({ value: "", label: "" })}>
					<PlusIcon className="size-4" />
					Add choice
				</Button>
			</div>
		</div>
	)
}

function IconButton({ title, disabled, onClick, children }: React.ComponentProps<"button">) {
	return (
		<button
			type="button"
			title={title}
			aria-label={title}
			disabled={disabled}
			onClick={onClick}
			className={cn(
				"flex size-8 shrink-0 items-center justify-center rounded border-0 bg-transparent p-0 text-neutral-500",
				disabled ? "cursor-not-allowed opacity-30" : "cursor-pointer hover:bg-neutral-100 hover:text-neutral-900",
			)}
		>
			{children}
		</button>
	)
}
