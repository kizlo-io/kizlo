import type { CustomFieldDefinition } from "@kizlo/shared"
import { ArrowDownIcon, ArrowUpIcon, CaretDownIcon, PlusIcon, SquaresFourIcon, StackIcon, TrashIcon } from "@phosphor-icons/react"
import { useState } from "react"
import { type Control, type FieldErrors, type FieldValues, useFieldArray, useFormState } from "react-hook-form"
import {
	ComboboxField,
	DateField,
	EmailField,
	MediaField,
	NumberInputField,
	RichTextField,
	SelectField,
	SwitchField,
	TextareaInputField,
	TextInputField,
	UrlField,
} from "@/shared/components/fields"
import { Button } from "@/shared/components/ui/button"
import { FieldLabel } from "@/shared/components/ui/field-label"
import { cn } from "@/shared/lib/utils"

interface FieldsProps {
	control: Control<FieldValues>
	definitions: CustomFieldDefinition[]
	/** Dot-path prefix for nested values, e.g. `features.0`. */
	prefix?: string
}

/** Render the value inputs for an ordered list of definitions. */
export function CustomFieldsFields({ control, definitions, prefix }: FieldsProps) {
	return (
		<div className="flex flex-col gap-6">
			{definitions.map((definition) => (
				<CustomFieldInput key={definition.key} control={control} definition={definition} prefix={prefix} />
			))}
		</div>
	)
}

function path(prefix: string | undefined, name: string): string {
	return prefix ? `${prefix}.${name}` : name
}

function labelOf(definition: CustomFieldDefinition): string {
	const label = definition.label || definition.name
	return definition.required ? `${label} *` : label
}

function CustomFieldInput({
	control,
	definition,
	prefix,
}: {
	control: Control<FieldValues>
	definition: CustomFieldDefinition
	prefix?: string
}) {
	const name = path(prefix, definition.name)
	const label = labelOf(definition)
	const description = definition.instructions || undefined

	switch (definition.type) {
		case "text":
			return <TextInputField control={control} name={name} label={label} description={description} />
		case "textarea":
			return <TextareaInputField control={control} name={name} label={label} description={description} />
		case "richtext":
			return <RichTextField control={control} name={name} label={label} description={description} />
		case "number":
			return (
				<NumberInputField
					control={control}
					name={name}
					label={label}
					description={description}
					min={definition.min ?? undefined}
					max={definition.max ?? undefined}
					step={definition.step ?? undefined}
				/>
			)
		case "toggle":
			return <SwitchField control={control} name={name} label={label} description={description} />
		case "url":
			return <UrlField control={control} name={name} label={label} description={description} />
		case "email":
			return <EmailField control={control} name={name} label={label} description={description} />
		case "date":
			return <DateField control={control} name={name} label={label} description={description} />
		case "select":
			return <SelectField control={control} name={name} label={label} description={description} options={definition.choices} />
		case "multiselect":
			return <ComboboxField multiple control={control} name={name} label={label} description={description} options={definition.choices} />
		case "image":
			return <MediaField control={control} name={name} label={label} description={description} mediaType="image" />
		case "file":
			return <MediaField control={control} name={name} label={label} description={description} mediaType="application" />
		case "group":
			return (
				<Fieldset control={control} name={name} label={label} description={description} marker={<SquaresFourIcon className="size-4" />}>
					<CustomFieldsFields control={control} definitions={definition.fields} prefix={name} />
				</Fieldset>
			)
		case "repeater":
			return <RepeaterInput control={control} definition={definition} name={name} label={label} description={description} />
	}
}

function Fieldset({
	control,
	name,
	label,
	description,
	marker,
	children,
}: {
	control: Control<FieldValues>
	name: string
	label: string
	description?: string
	/** Replaces the caret, for a field type that reads better with its own marker. */
	marker?: React.ReactNode
	children: React.ReactNode
}) {
	const { open, toggle } = useCollapsible(control, name, false)

	return (
		<div className="flex flex-col gap-2">
			{/* Named outside the box, the way every other field names its control. */}
			<FieldLabel label={label} desc={description} />
			<fieldset className="has-focus-visible:wp-ring wp-field m-0 overflow-hidden bg-white p-0 has-focus-visible:border-primary">
				<legend className="sr-only">{label}</legend>
				<CollapseBar open={open} onToggle={toggle} label={label} marker={marker} />
				{open ? <div className="flex flex-col gap-4 border-[#e0e0e0] border-t p-3">{children}</div> : null}
			</fieldset>
		</div>
	)
}

/**
 * The header strip shared by every collapsible container, sized and bordered like a
 * WordPress 40px field so a collapsed container sits in the form at the same weight as
 * an input. The toggle fills the strip so the whole bar is clickable; row controls stay
 * beside it, because a button cannot nest inside another button.
 */
function CollapseBar({
	open,
	onToggle,
	label,
	marker,
	children,
	actions,
}: {
	open: boolean
	onToggle: () => void
	/** Accessible name for the toggle, which carries no visible text on a container. */
	label: string
	/** Muted field-type icon, shown where a container has no visible name of its own. */
	marker?: React.ReactNode
	children?: React.ReactNode
	actions?: React.ReactNode
}) {
	return (
		<div className="relative flex h-10 items-center gap-2 px-3">
			{/* Stretched so the whole bar toggles, and kept under the row controls, which are buttons of their own. */}
			<button
				type="button"
				aria-expanded={open}
				aria-label={label}
				onClick={onToggle}
				className="absolute inset-0 cursor-pointer border-0 bg-transparent"
			/>
			{marker ? <span className="pointer-events-none flex shrink-0 items-center text-[#949494]">{marker}</span> : null}
			{children ? <span className="pointer-events-none truncate text-[#1e1e1e] text-[13px]">{children}</span> : null}
			<CaretDownIcon
				className={cn("pointer-events-none ml-auto size-5 shrink-0 text-[#757575] transition-transform", open && "rotate-180")}
			/>
			{actions ? <div className="relative flex shrink-0 items-center gap-0.5">{actions}</div> : null}
		</div>
	)
}

function RepeaterInput({
	control,
	definition,
	name,
	label,
	description,
}: {
	control: Control<FieldValues>
	definition: Extract<CustomFieldDefinition, { type: "repeater" }>
	name: string
	label: string
	description?: string
}) {
	const { fields, append, remove, move } = useFieldArray({ control, name })
	const [openAppended, setOpenAppended] = useState(false)
	const atMax = definition.max != null && fields.length >= definition.max
	const atMin = definition.min != null && fields.length <= definition.min

	return (
		<Fieldset control={control} name={name} label={label} description={description} marker={<StackIcon className="size-4" />}>
			<div className="flex flex-col gap-2">
				{fields.map((row, index) => (
					<RepeaterRow
						key={row.id}
						control={control}
						definition={definition}
						name={name}
						index={index}
						rowCount={fields.length}
						atMin={atMin}
						defaultOpen={openAppended}
						onMove={(to) => move(index, to)}
						onRemove={() => remove(index)}
					/>
				))}
			</div>

			<div>
				<Button
					type="button"
					variant="secondary"
					size="sm"
					disabled={atMax}
					onClick={() => {
						setOpenAppended(true)
						append(emptyRow(definition.fields))
					}}
				>
					<PlusIcon className="size-4" />
					Add row
				</Button>
			</div>
		</Fieldset>
	)
}

/** Exported for the collapse tests; only {@link RepeaterInput} renders it. */
export function RepeaterRow({
	control,
	definition,
	name,
	index,
	rowCount,
	atMin,
	defaultOpen,
	onMove,
	onRemove,
}: {
	control: Control<FieldValues>
	definition: Extract<CustomFieldDefinition, { type: "repeater" }>
	name: string
	index: number
	rowCount: number
	atMin: boolean
	defaultOpen: boolean
	onMove: (to: number) => void
	onRemove: () => void
}) {
	const prefix = `${name}.${index}`
	const rowLabel = `${definition.label || definition.name} ${index + 1}`
	const { open, toggle } = useCollapsible(control, prefix, defaultOpen)

	return (
		<div className="has-focus-visible:wp-ring wp-field overflow-hidden bg-white has-focus-visible:border-primary">
			<CollapseBar
				open={open}
				onToggle={toggle}
				label={rowLabel}
				actions={
					<>
						<RowButton label="Move up" disabled={index === 0} onClick={() => onMove(index - 1)}>
							<ArrowUpIcon className="size-4" />
						</RowButton>
						<RowButton label="Move down" disabled={index === rowCount - 1} onClick={() => onMove(index + 1)}>
							<ArrowDownIcon className="size-4" />
						</RowButton>
						<RowButton label="Remove row" disabled={atMin} onClick={onRemove}>
							<TrashIcon className="size-4" />
						</RowButton>
					</>
				}
			>
				{rowLabel}
			</CollapseBar>
			{open ? (
				<div className="border-[#e0e0e0] border-t p-3">
					<CustomFieldsFields control={control} definitions={definition.fields} prefix={prefix} />
				</div>
			) : null}
		</div>
	)
}

function RowButton({
	label,
	disabled,
	onClick,
	children,
}: {
	label: string
	disabled?: boolean
	onClick: () => void
	children: React.ReactNode
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			disabled={disabled}
			onClick={onClick}
			className={cn(
				"flex size-7 items-center justify-center rounded-sm border-0 bg-transparent p-0 text-[#757575]",
				disabled ? "cursor-not-allowed opacity-30" : "cursor-pointer hover:bg-[#f0f0f0] hover:text-[#1e1e1e]",
			)}
		>
			{children}
		</button>
	)
}

// ====================================================
// COLLAPSING
// ====================================================

/**
 * Collapse state for one container. Every container starts closed, so one holding
 * an invalid field force-expands: each field renders its own inline error, and a
 * closed container would hide it while the save is rejected server-side.
 */
function useCollapsible(control: Control<FieldValues>, path: string, defaultOpen: boolean) {
	const { errors } = useFormState({ control })
	const [open, setOpen] = useState(defaultOpen)

	return { open: open || hasErrorAtPath(errors, path), toggle: () => setOpen((value) => !value) }
}

/** Whether the error tree holds a field error at `path` or anywhere beneath it. */
export function hasErrorAtPath(errors: FieldErrors, path: string): boolean {
	let node: unknown = errors

	for (const segment of path.split(".")) {
		if (!isRecord(node)) return false
		node = node[segment]
	}

	return holdsError(node)
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null
}

function holdsError(node: unknown): boolean {
	if (!isRecord(node)) return false
	if (typeof node.message === "string" || typeof node.type === "string") return true
	return Object.values(node).some(holdsError)
}

// ====================================================
// VALUE TRANSFORMS
// ====================================================

/** The default form value for a single definition when no stored value exists. */
export function defaultValue(definition: CustomFieldDefinition): unknown {
	switch (definition.type) {
		case "toggle":
			return definition.default ?? false
		case "multiselect":
			return definition.default ?? []
		case "number":
			return definition.default ?? null
		case "image":
		case "file":
			return null
		case "group":
			return Object.fromEntries(definition.fields.map((child) => [child.name, defaultValue(child)]))
		case "repeater":
			return []
		default:
			return definition.default ?? ""
	}
}

function emptyRow(fields: CustomFieldDefinition[]): Record<string, unknown> {
	return Object.fromEntries(fields.map((field) => [field.name, defaultValue(field)]))
}

/**
 * Shape server-provided values into complete form values: every configured field
 * is present (falling back to its default), so react-hook-form controls stay
 * controlled and nothing is dropped on save.
 */
export function toFormValues(definitions: CustomFieldDefinition[], values: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {}

	for (const definition of definitions) {
		const value = values?.[definition.name]

		if (definition.type === "group") {
			out[definition.name] = toFormValues(definition.fields, (value as Record<string, unknown>) ?? {})
		} else if (definition.type === "repeater") {
			const rows = Array.isArray(value) ? value : []
			out[definition.name] = rows.map((row) => toFormValues(definition.fields, (row as Record<string, unknown>) ?? {}))
		} else if (value === undefined || value === null) {
			out[definition.name] = defaultValue(definition)
		} else {
			out[definition.name] = value
		}
	}

	return out
}

/**
 * Reduce form values to the storage shape sent to the server: media fields collapse
 * to their attachment id, groups and repeaters recurse. Unknown keys are dropped so
 * only configured fields are written.
 */
export function toStorageValues(definitions: CustomFieldDefinition[], values: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {}

	for (const definition of definitions) {
		const value = values?.[definition.name]

		switch (definition.type) {
			case "image":
			case "file":
				out[definition.name] = (value as { id?: number } | null)?.id ?? null
				break
			case "group":
				out[definition.name] = toStorageValues(definition.fields, (value as Record<string, unknown>) ?? {})
				break
			case "repeater":
				out[definition.name] = (Array.isArray(value) ? value : []).map((row) =>
					toStorageValues(definition.fields, (row as Record<string, unknown>) ?? {}),
				)
				break
			default:
				out[definition.name] = value ?? null
		}
	}

	return out
}
