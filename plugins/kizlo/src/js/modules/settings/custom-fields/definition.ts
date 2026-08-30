import type { CustomFieldDefinition, CustomFieldType } from "@kizlo/shared"

function fieldKey(): string {
	return `field_${crypto.randomUUID().replace(/-/g, "").slice(0, 13)}`
}

export function newDefinition(): CustomFieldDefinition {
	return { key: fieldKey(), name: "", label: "", instructions: "", required: false, type: "text", default: null }
}

/** Collect stable identities from the saved tree, independent of array positions. */
export function persistedDefinitionKeys(definitions: CustomFieldDefinition[] | undefined): ReadonlySet<string> {
	const keys = new Set<string>()

	function visit(fields: CustomFieldDefinition[] | undefined) {
		for (const field of fields ?? []) {
			keys.add(field.key)
			if (field.type === "group" || field.type === "repeater") visit(field.fields)
		}
	}

	visit(definitions)
	return keys
}

/** Shape every type change into a complete target configuration before render. */
export function changeDefinitionType(definition: CustomFieldDefinition, type: CustomFieldType): CustomFieldDefinition {
	const base = {
		key: definition.key,
		name: definition.name,
		label: definition.label,
		instructions: definition.instructions,
		required: definition.required,
	}
	const choices = definition.type === "select" || definition.type === "multiselect" ? definition.choices : []
	const choiceValues = new Set(choices.map((choice) => choice.value))
	const currentDefault = "default" in definition ? definition.default : null

	switch (type) {
		case "text":
		case "textarea":
		case "richtext":
		case "url":
		case "email":
		case "date":
			return { ...base, type, default: typeof currentDefault === "string" ? currentDefault : null }
		case "number":
			return { ...base, type, default: typeof currentDefault === "number" ? currentDefault : null, min: null, max: null, step: null }
		case "toggle":
			return { ...base, type, default: typeof currentDefault === "boolean" ? currentDefault : false }
		case "select": {
			const candidate = Array.isArray(currentDefault) ? currentDefault[0] : currentDefault
			return { ...base, type, choices, default: typeof candidate === "string" && choiceValues.has(candidate) ? candidate : null }
		}
		case "multiselect": {
			const candidates = Array.isArray(currentDefault)
				? currentDefault
				: typeof currentDefault === "string" && currentDefault !== ""
					? [currentDefault]
					: []
			return { ...base, type, choices, default: candidates.filter((value) => choiceValues.has(value)) }
		}
		case "image":
		case "file":
			return { ...base, type }
		case "group":
			return { ...base, type, fields: "fields" in definition ? definition.fields : [] }
		case "repeater":
			return { ...base, type, fields: "fields" in definition ? definition.fields : [], min: null, max: null }
	}
}
