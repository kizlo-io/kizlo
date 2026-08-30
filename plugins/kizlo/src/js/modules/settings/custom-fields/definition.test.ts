import type { CustomFieldDefinition, CustomFieldType } from "@kizlo/shared"
import { describe, expect, it } from "vitest"
import { changeDefinitionType, newDefinition, persistedDefinitionKeys } from "./definition"

const types: CustomFieldType[] = [
	"text",
	"textarea",
	"richtext",
	"number",
	"toggle",
	"select",
	"multiselect",
	"url",
	"email",
	"date",
	"image",
	"file",
	"group",
	"repeater",
]

describe("custom field definition builder", () => {
	it.each(types)("initializes a complete %s configuration", (type) => {
		const definition = changeDefinitionType(newDefinition(), type)

		expect(definition.type).toBe(type)
		if (type === "number") expect(definition).toMatchObject({ default: null, min: null, max: null, step: null })
		if (type === "toggle") expect(definition).toMatchObject({ default: false })
		if (type === "multiselect") expect(definition).toMatchObject({ choices: [], default: [] })
		if (type === "repeater") expect(definition).toMatchObject({ fields: [], min: null, max: null })
	})

	it("converts a Select default when changing to Multi-select", () => {
		const select: CustomFieldDefinition = {
			...newDefinition(),
			type: "select",
			choices: [{ value: "a", label: "A" }],
			default: "a",
		}

		expect(changeDefinitionType(select, "multiselect")).toMatchObject({ type: "multiselect", default: ["a"] })
	})

	it("converts or clears Multi-select defaults when changing to Select", () => {
		const multiselect: CustomFieldDefinition = {
			...newDefinition(),
			type: "multiselect",
			choices: [{ value: "a", label: "A" }],
			default: [],
		}

		expect(changeDefinitionType(multiselect, "select")).toMatchObject({ type: "select", default: null })
		expect(changeDefinitionType({ ...multiselect, default: ["a"] }, "select")).toMatchObject({ type: "select", default: "a" })
	})

	it("resolves persisted identities recursively without depending on tree positions", () => {
		const leaf = { ...newDefinition(), key: "field_leaf" }
		const sibling = { ...newDefinition(), key: "field_sibling" }
		const repeater: CustomFieldDefinition = {
			...newDefinition(),
			key: "field_repeater",
			type: "repeater",
			fields: [sibling, leaf],
			min: null,
			max: null,
		}
		const group: CustomFieldDefinition = { ...newDefinition(), key: "field_group", type: "group", fields: [repeater] }

		const persistedKeys = persistedDefinitionKeys([group, { ...newDefinition(), key: "field_top" }])

		expect(persistedKeys).toEqual(new Set(["field_group", "field_repeater", "field_sibling", "field_leaf", "field_top"]))
		expect(["field_top", "field_group", "field_repeater", "field_leaf", "field_sibling"].every((key) => persistedKeys.has(key))).toBe(true)
	})

	it("keeps an unsaved definition editable until its key is persisted", () => {
		const definition = newDefinition()

		expect(persistedDefinitionKeys([]).has(definition.key)).toBe(false)
		expect(persistedDefinitionKeys([definition]).has(definition.key)).toBe(true)
	})
})
