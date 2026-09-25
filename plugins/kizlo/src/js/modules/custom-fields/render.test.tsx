import type { CustomFieldDefinition } from "@kizlo/shared"
import { renderToStaticMarkup } from "react-dom/server"
import { type FieldErrors, type FieldValues, useForm } from "react-hook-form"
import { describe, expect, it, vi } from "vitest"

vi.mock("@wordpress/components", async () => {
	const React = await import("react")
	const passthrough = ({ children }: { children?: React.ReactNode }) => children

	return {
		TextControl: ({ id, name, value }: { id?: string; name?: string; value?: string }) =>
			React.createElement("input", { id, name, type: "text", defaultValue: value }),
		TextareaControl: () => null,
		__experimentalNumberControl: () => null,
		BaseControl: passthrough,
		Button: passthrough,
		Tooltip: passthrough,
	}
})

import { ContentForm } from "./ContentForm"
import { hasErrorAtPath, RepeaterRow, toFormValues } from "./render"

function textField(name: string, label: string): CustomFieldDefinition {
	return { key: `field_${name}`, name, label, instructions: "", required: false, type: "text", default: null }
}

const group: CustomFieldDefinition = {
	key: "field_details",
	name: "details",
	label: "Details",
	instructions: "Everything the front end needs.",
	required: false,
	type: "group",
	fields: [textField("note", "Note")],
}

const repeater: Extract<CustomFieldDefinition, { type: "repeater" }> = {
	key: "field_links",
	name: "links",
	label: "Link",
	instructions: "",
	required: false,
	type: "repeater",
	fields: [textField("url", "URL")],
	min: null,
	max: null,
}

const values = { details: { note: "Nested note" }, links: [{ url: "https://example.com" }] }

/** `value="…"` carries the serialized payload HTML-escaped. */
function decodeAttribute(value: string): string {
	return value.replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&amp;", "&")
}

function RowHarness({ defaultOpen }: { defaultOpen: boolean }) {
	const form = useForm<FieldValues>({ defaultValues: toFormValues([repeater], values) })

	return (
		<RepeaterRow
			control={form.control}
			definition={repeater}
			name="links"
			index={0}
			rowCount={1}
			atMin={false}
			defaultOpen={defaultOpen}
			onMove={() => {}}
			onRemove={() => {}}
		/>
	)
}

describe("collapsible custom fields", () => {
	it("renders a group collapsed, naming it outside the box", () => {
		const markup = renderToStaticMarkup(<ContentForm definitions={[group]} values={values} />)

		expect(markup).toContain("Details")
		expect(markup.indexOf("Details")).toBeLessThan(markup.indexOf("<fieldset"))
		expect(markup).not.toContain("details.note-text-input")
	})

	it("renders a repeater collapsed, hiding its rows", () => {
		const markup = renderToStaticMarkup(<ContentForm definitions={[repeater]} values={values} />)

		expect(markup).toContain("Link")
		expect(markup).not.toContain("Link 1")
		expect(markup).not.toContain("links.0.url-text-input")
	})

	it("renders a repeater row body only once the row is open", () => {
		const closed = renderToStaticMarkup(<RowHarness defaultOpen={false} />)
		const open = renderToStaticMarkup(<RowHarness defaultOpen />)

		expect(closed).toContain("Link 1")
		expect(closed).not.toContain("links.0.url-text-input")
		expect(open).toContain("links.0.url-text-input")
	})

	it("keeps the row controls beside the toggle rather than inside it", () => {
		const markup = renderToStaticMarkup(<RowHarness defaultOpen />)
		const tags = markup.match(/<button|<\/button>/g) ?? []

		let depth = 0
		let deepest = 0
		for (const tag of tags) {
			depth += tag === "<button" ? 1 : -1
			deepest = Math.max(deepest, depth)
		}

		// The toggle plus move up, move down, and remove, none of them nested.
		expect(tags.filter((tag) => tag === "<button")).toHaveLength(4)
		expect(deepest).toBe(1)
	})

	it("renders every collapse toggle as a non-submitting button", () => {
		const markup = renderToStaticMarkup(<ContentForm definitions={[group, repeater]} values={values} />)
		const toggles = markup.match(/<[a-z]+[^>]*\saria-expanded="[^>]*>/g) ?? []

		expect(toggles.length).toBeGreaterThan(0)

		for (const toggle of toggles) {
			expect(toggle.startsWith("<button ")).toBe(true)
			expect(toggle).toContain('type="button"')
		}
	})

	it("serializes the full value tree while everything is collapsed", () => {
		const markup = renderToStaticMarkup(<ContentForm definitions={[group, repeater]} values={values} />)
		const serialized = /name="kizlo_custom_fields" value="([^"]*)"/.exec(markup)?.[1]

		expect(serialized).toBeDefined()
		expect(JSON.parse(decodeAttribute(serialized as string))).toEqual({
			details: { note: "Nested note" },
			links: [{ url: "https://example.com" }],
		})
	})
})

describe("hasErrorAtPath", () => {
	const errors = {
		title: { type: "too_small", message: "Required" },
		details: { note: { type: "too_small", message: "Required" } },
		links: [{ url: { type: "invalid_string", message: "Invalid URL" } }],
	} as unknown as FieldErrors

	it("matches an error on the exact path", () => {
		expect(hasErrorAtPath(errors, "title")).toBe(true)
	})

	it("matches an error on a descendant path", () => {
		expect(hasErrorAtPath(errors, "details")).toBe(true)
	})

	it("matches an error inside a repeater row", () => {
		expect(hasErrorAtPath(errors, "links.0")).toBe(true)
	})

	it("does not match a sibling path", () => {
		expect(hasErrorAtPath(errors, "summary")).toBe(false)
		expect(hasErrorAtPath(errors, "links.1")).toBe(false)
	})
})
