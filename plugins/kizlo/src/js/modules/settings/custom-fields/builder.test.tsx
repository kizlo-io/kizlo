// @vitest-environment jsdom

import type { CustomFieldDefinition } from "@kizlo/shared"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { type Control, useForm } from "react-hook-form"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@wordpress/components", async () => {
	const React = await import("react")

	return {
		Button: ({
			children,
			__next40pxDefaultSize: _nextSize,
			...props
		}: React.ComponentProps<"button"> & { __next40pxDefaultSize?: boolean }) => React.createElement("button", props, children),
	}
})

vi.mock("@/shared/components/fields", async () => {
	const React = await import("react")
	const { useController } = await import("react-hook-form")
	type FieldProps = { control: Control<any>; name: string; label?: string; disabled?: boolean }

	return {
		TextInputField: ({ control, name, label, disabled }: FieldProps) => {
			const { field } = useController({ control, name })
			return React.createElement("input", { ...field, value: field.value ?? "", name, "aria-label": label ?? name, disabled })
		},
		ComboboxField: ({
			control,
			name,
			label,
			options,
			onValueChange,
		}: FieldProps & { options?: { value: string; label: string }[]; onValueChange?: (value: string) => void }) => {
			const { field } = useController({ control, name })
			return React.createElement(
				"select",
				{
					name,
					"aria-label": label ?? name,
					value: typeof field.value === "string" ? field.value : "",
					onChange: (event: React.ChangeEvent<HTMLSelectElement>) => {
						field.onChange(event.target.value)
						onValueChange?.(event.target.value)
					},
				},
				(options ?? []).map((option) => React.createElement("option", { key: option.value, value: option.value }, option.label)),
			)
		},
		NumberInputField: () => null,
		RichTextField: () => null,
		SelectField: () => null,
		SwitchField: () => null,
		TextareaInputField: () => null,
	}
})

import { CustomFieldsBuilder } from "./builder"

type FormValues = { custom_fields: CustomFieldDefinition[] }
type ContainerType = "group" | "repeater"

function textField(name: string, label: string): CustomFieldDefinition {
	return { name, label, instructions: "", required: false, type: "text", default: `${name} value` }
}

function containerField(type: ContainerType, name: string, label: string, fields: CustomFieldDefinition[]): CustomFieldDefinition {
	const base = { name, label, instructions: "", required: false, fields }
	return type === "group" ? { ...base, type } : { ...base, type, min: null, max: null }
}

function Harness({ definitions }: { definitions: CustomFieldDefinition[] }) {
	const form = useForm<FormValues>({ defaultValues: { custom_fields: definitions } })

	return (
		<>
			<CustomFieldsBuilder control={form.control} name="custom_fields" />
			<button type="button" aria-label="Save definitions" onClick={() => form.reset(form.getValues())}>
				Save
			</button>
		</>
	)
}

let host: HTMLDivElement
let root: Root

beforeAll(() => {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
})

beforeEach(() => {
	host = document.createElement("div")
	document.body.append(host)
	root = createRoot(host)
})

afterEach(() => {
	act(() => root.unmount())
	host.remove()
})

afterAll(() => {
	vi.unstubAllGlobals()
})

function renderBuilder(definitions: CustomFieldDefinition[]) {
	act(() => root.render(<Harness definitions={definitions} />))
}

function click(element: Element) {
	act(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })))
}

function toggle(label: string): HTMLButtonElement {
	const element = [...host.querySelectorAll<HTMLButtonElement>('button[aria-label="Expand"], button[aria-label="Collapse"]')].find(
		(button) => button.textContent?.includes(label),
	)
	expect(element).toBeTruthy()
	return element as HTMLButtonElement
}

/** Drive a controlled input the way React's own change handler expects. */
function type(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
	act(() => {
		setter?.call(input, value)
		input.dispatchEvent(new Event("input", { bubbles: true }))
	})
}

function addFieldButton(scope: ParentNode): HTMLButtonElement {
	const element = [...scope.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === "Add Field")
	expect(element).toBeTruthy()
	return element as HTMLButtonElement
}

function actionButton(fieldToggle: HTMLButtonElement, label: string): HTMLButtonElement {
	const element = fieldToggle.parentElement?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
	expect(element).toBeTruthy()
	return element as HTMLButtonElement
}

describe("CustomFieldsBuilder persisted identities", () => {
	it.each([
		["group", "Move down", 0, 1],
		["group", "Move up", 1, 0],
		["repeater", "Move down", 0, 1],
		["repeater", "Move up", 1, 0],
	] as const)("keeps a saved %s child name locked after its parent is moved with %s", (type, action, startIndex, endIndex) => {
		const parent = containerField(type, "saved_parent", "Saved parent", [textField("saved_child", "Saved child")])
		const other = textField("other", "Other")
		renderBuilder(startIndex === 0 ? [parent, other] : [other, parent])

		const parentToggle = toggle("Saved parent")
		click(actionButton(parentToggle, action))
		click(parentToggle)
		click(toggle("Saved child"))

		const name = host.querySelector<HTMLInputElement>(`input[name="custom_fields.${endIndex}.fields.0.name"]`)
		expect(name?.disabled).toBe(true)
	})

	it("keeps saved child identities locked when children are reordered", () => {
		const parent = containerField("group", "saved_parent", "Saved parent", [
			textField("first_child", "First child"),
			textField("second_child", "Second child"),
		])
		renderBuilder([parent])
		click(toggle("Saved parent"))

		const firstToggle = toggle("First child")
		click(actionButton(firstToggle, "Move down"))
		click(firstToggle)

		const name = host.querySelector<HTMLInputElement>('input[name="custom_fields.0.fields.1.name"]')
		expect(name?.disabled).toBe(true)
	})

	it.each(["group", "repeater"] as const)(
		"keeps a new %s child editable through parent movement and remount, then locks it on save",
		(type) => {
			const parent = containerField(type, "saved_parent", "Saved parent", [])
			renderBuilder([parent, textField("other", "Other")])

			const parentToggle = toggle("Saved parent")
			click(actionButton(parentToggle, "Move down"))
			click(parentToggle)
			const parentCard = parentToggle.parentElement?.parentElement as HTMLDivElement
			const addChild = [...parentCard.querySelectorAll<HTMLButtonElement>("button")].find(
				(button) => button.textContent?.trim() === "Add Field",
			)
			click(addChild as HTMLButtonElement)

			const childNameSelector = 'input[name="custom_fields.1.fields.0.name"]'
			expect(host.querySelector<HTMLInputElement>(childNameSelector)?.disabled).toBe(false)

			click(parentToggle)
			click(parentToggle)
			click(toggle("Untitled field"))
			expect(host.querySelector<HTMLInputElement>(childNameSelector)?.disabled).toBe(false)

			click(host.querySelector<HTMLButtonElement>('button[aria-label="Save definitions"]') as HTMLButtonElement)
			click(toggle("Saved parent"))
			click(toggle("Untitled field"))
			expect(host.querySelector<HTMLInputElement>(childNameSelector)?.disabled).toBe(true)
		},
	)

	it("keeps a new nested field editable when its name matches a persisted field at another level", () => {
		// A flat, tree-wide name set would see "title" as already persisted and
		// lock this child. Names are unique per level, so the group owns its own.
		const parent = containerField("group", "details", "Details", [])
		renderBuilder([textField("title", "Title"), parent])

		click(toggle("Details"))
		const parentCard = toggle("Details").parentElement?.parentElement as HTMLDivElement
		click(addFieldButton(parentCard))

		const childName = host.querySelector<HTMLInputElement>('input[name="custom_fields.1.fields.0.name"]') as HTMLInputElement
		type(childName, "title")

		// The new child keeps the name editable; the saved field of the same name stays locked.
		expect(host.querySelector<HTMLInputElement>('input[name="custom_fields.1.fields.0.name"]')?.disabled).toBe(false)

		click(toggle("Title"))
		expect(host.querySelector<HTMLInputElement>('input[name="custom_fields.0.name"]')?.disabled).toBe(true)
	})

	it("opens a newly added row and keeps it open through a type change", () => {
		renderBuilder([textField("title", "Title")])

		click(addFieldButton(host))
		expect(host.querySelector('input[name="custom_fields.1.name"]')).toBeTruthy()

		// update() remounts the card, so the open state cannot live on field.id.
		const types = [...host.querySelectorAll<HTMLSelectElement>('select[aria-label="Type"]')]
		const select = types.at(-1) as HTMLSelectElement
		act(() => {
			select.value = "number"
			select.dispatchEvent(new Event("change", { bubbles: true }))
		})

		expect(host.querySelector('input[name="custom_fields.1.name"]')).toBeTruthy()
		expect(host.querySelector<HTMLSelectElement>('select[name="custom_fields.1.type"]')?.value).toBe("number")
	})
})
