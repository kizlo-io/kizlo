import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("@wordpress/components", async () => {
	const React = await import("react")

	return {
		TextareaControl: ({ label, onChange, ...props }: React.ComponentProps<"textarea"> & { label?: React.ReactNode }) => {
			const generatedId = "wordpress-textarea-control"

			return React.createElement(
				React.Fragment,
				null,
				React.createElement("label", { htmlFor: generatedId }, label),
				React.createElement("textarea", { id: generatedId, onChange, ...props }),
			)
		},
		TextControl: () => null,
		__experimentalNumberControl: () => null,
		BaseControl: ({ children }: { children?: React.ReactNode }) => children,
		Button: ({ children }: { children?: React.ReactNode }) => children,
		Tooltip: ({ children }: { children?: React.ReactNode }) => children,
	}
})

import { TextareaInput } from "./input"

describe("TextareaInput", () => {
	it("associates its visible label with the textarea", () => {
		const markup = renderToStaticMarkup(<TextareaInput name="summary" label="Summary" value="" />)
		const labelTarget = /<label[^>]*for="([^"]+)"/.exec(markup)?.[1]
		const textareaId = /<textarea[^>]*id="([^"]+)"/.exec(markup)?.[1]

		expect(labelTarget).toBeTruthy()
		expect(textareaId).toBe(labelTarget)
	})
})
