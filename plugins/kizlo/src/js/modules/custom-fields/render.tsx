import type { CustomFieldDefinition } from "@kizlo/shared"
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react"
import { type Control, type FieldValues, useFieldArray } from "react-hook-form"
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
				<Fieldset label={label} description={description}>
					<CustomFieldsFields control={control} definitions={definition.fields} prefix={name} />
				</Fieldset>
			)
		case "repeater":
			return <RepeaterInput control={control} definition={definition} name={name} label={label} description={description} />
	}
}

function Fieldset({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
	return (
		<fieldset className="m-0 flex flex-col gap-4 rounded-lg border border-neutral-200 p-4">
			<legend className="px-1">
				<FieldLabel label={label} desc={description} descMode="below" />
			</legend>
			{children}
		</fieldset>
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
	const atMax = definition.max != null && fields.length >= definition.max
	const atMin = definition.min != null && fields.length <= definition.min

	return (
		<Fieldset label={label} description={description}>
			<div className="flex flex-col gap-3">
				{fields.map((row, index) => (
					<div key={row.id} className="rounded-lg border border-neutral-200 bg-neutral-50/50">
						<div className="flex items-center justify-between border-neutral-200 border-b px-3 py-1.5">
							<span className="font-medium text-neutral-500 text-xs">
								{definition.label || definition.name} {index + 1}
							</span>
							<div className="flex items-center gap-0.5">
								<RowButton label="Move up" disabled={index === 0} onClick={() => move(index, index - 1)}>
									<ArrowUpIcon className="size-4" />
								</RowButton>
								<RowButton label="Move down" disabled={index === fields.length - 1} onClick={() => move(index, index + 1)}>
									<ArrowDownIcon className="size-4" />
								</RowButton>
								<RowButton label="Remove row" disabled={atMin} onClick={() => remove(index)}>
									<TrashIcon className="size-4" />
								</RowButton>
							</div>
						</div>
						<div className="p-3">
							<CustomFieldsFields control={control} definitions={definition.fields} prefix={`${name}.${index}`} />
						</div>
					</div>
				))}
			</div>

			<div>
				<Button type="button" variant="secondary" size="sm" disabled={atMax} onClick={() => append(emptyRow(definition.fields))}>
					<PlusIcon className="size-4" />
					Add row
				</Button>
			</div>
		</Fieldset>
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
				"flex size-7 items-center justify-center rounded border-0 bg-transparent p-0 text-neutral-500",
				disabled ? "cursor-not-allowed opacity-30" : "cursor-pointer hover:bg-neutral-200 hover:text-neutral-900",
			)}
		>
			{children}
		</button>
	)
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
