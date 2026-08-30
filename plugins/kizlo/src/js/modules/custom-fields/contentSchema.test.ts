import type { CustomFieldDefinition } from "@kizlo/shared"
import { describe, expect, it } from "vitest"
import { buildContentSchema } from "./contentSchema"

function accepts(definition: CustomFieldDefinition, value: unknown): boolean {
	return buildContentSchema([definition]).safeParse({ [definition.name]: value }).success
}

describe("custom field content constraints", () => {
	it("enforces Number minimum, maximum, and step", () => {
		const number: CustomFieldDefinition = {
			key: "field_number",
			name: "score",
			label: "Score",
			instructions: "",
			required: false,
			type: "number",
			default: null,
			min: 0,
			max: 10,
			step: 2,
		}

		expect(accepts(number, -1)).toBe(false)
		expect(accepts(number, 11)).toBe(false)
		expect(accepts(number, 3)).toBe(false)
		expect(accepts(number, 4)).toBe(true)
	})

	it("rejects impossible dates and accepts a real leap day", () => {
		const date: CustomFieldDefinition = {
			key: "field_date",
			name: "launch",
			label: "Launch",
			instructions: "",
			required: false,
			type: "date",
			default: null,
		}

		expect(accepts(date, "2025-02-29")).toBe(false)
		expect(accepts(date, "2026-13-40")).toBe(false)
		expect(accepts(date, "2024-02-29")).toBe(true)
	})

	it("requires one populated descendant in a required Group", () => {
		const group: CustomFieldDefinition = {
			key: "field_group",
			name: "details",
			label: "Details",
			instructions: "",
			required: true,
			type: "group",
			fields: [
				{
					key: "field_note",
					name: "note",
					label: "Note",
					instructions: "",
					required: false,
					type: "text",
					default: null,
				},
			],
		}

		expect(accepts(group, { note: "" })).toBe(false)
		expect(accepts(group, { note: "Present" })).toBe(true)
	})
})
