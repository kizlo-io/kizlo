import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { ActiveKizloClient } from "./client"
import { KizloProvider, useKizloContext } from "./react"

// A stand-in for the app's browser client. The provider only stores it, so nothing here is ever called.
const client = { posts: {} } as unknown as ActiveKizloClient

const BUILT_ENTRY = fileURLToPath(new URL("../dist/react.js", import.meta.url))

function ReadsContext() {
	const { client: fromContext } = useKizloContext()

	return <span>{fromContext === client ? "same client" : "different client"}</span>
}

describe("KizloProvider", () => {
	it("hands its client to the components below it", () => {
		const markup = renderToStaticMarkup(
			<KizloProvider client={client}>
				<ReadsContext />
			</KizloProvider>,
		)

		expect(markup).toBe("<span>same client</span>")
	})

	it("throws when mounted without a client", () => {
		const render = () =>
			renderToStaticMarkup(
				<KizloProvider client={undefined as unknown as ActiveKizloClient}>
					<ReadsContext />
				</KizloProvider>,
			)

		expect(render).toThrow("needs the browser client `createKizloClient` returned")
	})
})

describe("useKizloContext", () => {
	it("throws when no provider is mounted", () => {
		expect(() => renderToStaticMarkup(<ReadsContext />)).toThrow("from kizlo/react above this component")
	})
})

// Both properties below are emergent from the build config rather than stated in the source, which is why
// they are asserted here: nothing else fails when either one silently changes.
describe("the built entry", () => {
	it("keeps its `use client` directive", () => {
		// Rolldown carries the source directive through today, bundled or not, and nothing else checks that it
		// still does. A chunk that lost it turns the provider into a server component in every consuming app.
		expect(existsSync(BUILT_ENTRY)).toBe(true)
		expect(readFileSync(BUILT_ENTRY, "utf-8").trimStart()).toMatch(/^["']use client["']/)
	})

	it("compiles its JSX rather than preserving it", () => {
		// The shared tsconfig base sets `jsx: preserve` for Next and Astro; `tsconfig.json` overrides it, and
		// the jsx-runtime import is the proof that override reached the build.
		const built = readFileSync(BUILT_ENTRY, "utf-8")

		expect(built).toContain("react/jsx-runtime")
		expect(built).not.toContain("<KizloContext.Provider")
	})
})
