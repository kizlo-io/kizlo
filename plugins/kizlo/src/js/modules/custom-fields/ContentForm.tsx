import { zodResolver } from "@hookform/resolvers/zod"
import type { CustomFieldDefinition } from "@kizlo/shared"
import { useMemo } from "react"
import { type FieldValues, type Resolver, useForm } from "react-hook-form"
import { buildContentSchema } from "./contentSchema"
import { CustomFieldsFields, toFormValues, toStorageValues } from "./render"

interface ContentFormProps {
	definitions: CustomFieldDefinition[]
	values: Record<string, unknown>
}

/**
 * The custom-fields editor mounted in the post metabox and the taxonomy add/edit
 * forms. It hydrates react-hook-form from the stored values and mirrors the current
 * values — collapsed to the storage shape — into a hidden `kizlo_custom_fields`
 * input that rides the classic form submit to the PHP save handler.
 */
export function ContentForm({ definitions, values }: ContentFormProps) {
	const resolver = useMemo(() => zodResolver(buildContentSchema(definitions) as never) as Resolver<FieldValues>, [definitions])
	const form = useForm<FieldValues>({ defaultValues: toFormValues(definitions, values), resolver, mode: "onChange" })
	const watched = form.watch()

	const serialized = useMemo(() => JSON.stringify(toStorageValues(definitions, watched)), [definitions, watched])

	return (
		<div className="flex flex-col gap-6">
			<input type="hidden" name="kizlo_custom_fields" value={serialized} />
			<CustomFieldsFields control={form.control} definitions={definitions} />
		</div>
	)
}
