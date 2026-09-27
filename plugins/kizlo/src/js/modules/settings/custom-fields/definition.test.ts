import type { CustomFieldDefinition, CustomFieldType } from "@kizlo/shared"
import { describe, expect, it } from "vitest"
import { changeDefinitionType, newDefinition } from "./definition"

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

	it("carries no identifier other than its name", () => {
		expect(newDefinition()).not.toHaveProperty("key")
		expect(newDefinition().name).toBe("")

		for (const type of types) {
			expect(changeDefinitionType({ ...newDefinition(), name: "price" }, type)).not.toHaveProperty("key")
		}
	})
})
