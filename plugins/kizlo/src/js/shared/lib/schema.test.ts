import type { CustomFieldDefinition, PostTypeSettings } from "@kizlo/shared"
import { describe, expect, it } from "vitest"
import { createPostTypeSettingsSchema } from "./schema"

const baseSettings: Pick<
	PostTypeSettings,
	| "pathname_structure"
	| "title_structure"
	| "description_structure"
	| "search_engine_visibility"
	| "webpage_type"
	| "article_type"
	| "comment_action_structure"
	| "seo_enabled"
	| "rest_api_enabled"
	| "breadcrumbs"
> = {
	pathname_structure: "/posts/{{slug}}",
	title_structure: "",
	description_structure: "",
	search_engine_visibility: true,
	webpage_type: "WebPage",
	article_type: "Article",
	comment_action_structure: "",
	seo_enabled: true,
	rest_api_enabled: true,
	breadcrumbs: [],
}

function field(config: Partial<CustomFieldDefinition> & Pick<CustomFieldDefinition, "type">): CustomFieldDefinition {
	return {
		key: "field_test",
		name: "test",
		label: "Test",
		instructions: "",
		required: false,
		...config,
	} as CustomFieldDefinition
}

function issuesFor(definition: CustomFieldDefinition) {
	const result = createPostTypeSettingsSchema().safeParse({ ...baseSettings, custom_fields: [definition] })
	expect(result.success).toBe(false)
	return result.success ? [] : result.error.issues
}

describe("custom field settings validation", () => {
	it.each([
		["number range", field({ type: "number", default: null, min: 5, max: 1, step: null }), "max"],
		["number step", field({ type: "number", default: 3, min: 0, max: 10, step: 2 }), "default"],
		["repeater bounds", field({ type: "repeater", fields: [], min: 1.5, max: 2 }), "min"],
		["required empty group", field({ type: "group", required: true, fields: [] }), "fields"],
		["empty choice value", field({ type: "select", choices: [{ value: "", label: "Blank" }], default: null }), "value"],
		[
			"duplicate choice value",
			field({
				type: "select",
				choices: [
					{ value: "a", label: "A" },
					{ value: "a", label: "Again" },
				],
				default: "a",
			}),
			"value",
		],
		["missing choice default", field({ type: "select", choices: [{ value: "a", label: "A" }], default: "missing" }), "default"],
		[
			"duplicate multiselect defaults",
			field({ type: "multiselect", choices: [{ value: "a", label: "A" }], default: ["a", "a"] }),
			"default",
		],
		["email default", field({ type: "email", default: "invalid" }), "default"],
		["URL default", field({ type: "url", default: "invalid" }), "default"],
		["calendar date", field({ type: "date", default: "2025-02-29" }), "default"],
	] as const)("rejects an invalid %s", (_name, definition, property) => {
		expect(issuesFor(definition).some((issue) => issue.path.at(-1) === property)).toBe(true)
	})

	it("reports duplicate nested names at the second Name input", () => {
		const definition = field({
			type: "group",
			fields: [
				field({ key: "field_one", name: "same", type: "text", default: null }),
				field({ key: "field_two", name: "same", type: "toggle", default: false }),
			],
		})

		expect(issuesFor(definition).some((issue) => issue.path.join(".") === "custom_fields.0.fields.1.name")).toBe(true)
	})
})
