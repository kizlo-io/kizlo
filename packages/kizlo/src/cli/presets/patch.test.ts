import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { applyPatchToSource, patchChanged, type ResolvedPatch, resolvePatchTargetPath } from "./patch"

const patch: Pick<ResolvedPatch, "imports" | "exports"> = {
	imports: [
		{ module: "kizlo/nextjs/server", names: ["createRootMetadata", "createRootViewport"] },
		{ module: "@/lib/kizlo/server", names: ["client"] },
	],
	exports: [
		{ name: "generateMetadata", value: "createRootMetadata(client)" },
		{ name: "generateViewport", value: "createRootViewport(client)" },
	],
}

const apply = (source: string, replaceConflicts = false) => applyPatchToSource(source, patch, { replaceConflicts })
/** Whitespace-insensitive contains, so assertions don't hinge on magicast's exact print spacing. */
const has = (text: string, snippet: string) => text.replace(/\s+/g, "").includes(snippet.replace(/\s+/g, ""))
/** How many import statements pull from `module` — 1 proves imports merged rather than duplicated. */
const importCount = (text: string, module: string) =>
	text.match(new RegExp(`from\\s*['"]${module.replace(/\//g, "\\/")}['"]`, "g"))?.length ?? 0

const FRESH = `import type { ReactNode } from "react"

export default function RootLayout({ children }: { children: ReactNode }) {
	return <html lang="en"><body>{children}</body></html>
}
`

describe("applyPatchToSource", () => {
	it("adds imports and exports to a layout that has none", () => {
		const { text, changes } = apply(FRESH)

		expect(changes.addedImports).toEqual(expect.arrayContaining(["createRootMetadata", "createRootViewport", "client"]))
		expect(changes.addedExports).toEqual(["generateMetadata", "generateViewport"])
		expect(changes.replacedExports).toEqual([])
		expect(has(text, 'import { createRootMetadata, createRootViewport } from "kizlo/nextjs/server"')).toBe(true)
		expect(has(text, 'import { client } from "@/lib/kizlo/server"')).toBe(true)
		expect(has(text, "export const generateMetadata = createRootMetadata(client)")).toBe(true)
		expect(has(text, "export const generateViewport = createRootViewport(client)")).toBe(true)
		// The user's own code is preserved, including JSX.
		expect(text).toContain("export default function RootLayout")
		expect(text).toContain('<html lang="en">')
	})

	it("is a no-op when the file is already wired", () => {
		const once = apply(FRESH)
		const twice = apply(once.text)
		expect(patchChanged(twice.changes)).toBe(false)
		expect(twice.text).toBe(once.text)
	})

	it("works the same on a plain JavaScript layout (no type syntax)", () => {
		const src = `export default function RootLayout({ children }) {
	return <html lang="en"><body>{children}</body></html>
}
`
		const { text, changes } = apply(src)
		expect(changes.addedExports).toEqual(["generateMetadata", "generateViewport"])
		expect(has(text, "export const generateMetadata = createRootMetadata(client)")).toBe(true)
		expect(text).toContain('<html lang="en">')
	})

	it("merges named imports into an existing named import from the same module", () => {
		const src = `import { createRootMetadata } from "kizlo/nextjs/server"
import { client } from "@/lib/kizlo/server"

export const generateMetadata = createRootMetadata(client)
`
		const { text, changes } = apply(src)
		expect(changes.addedImports).toEqual(["createRootViewport"])
		expect(importCount(text, "kizlo/nextjs/server")).toBe(1)
		expect(text).toContain("createRootViewport")
	})

	it("merges into a multi-line named import", () => {
		const src = `import {
	createRootMetadata,
} from "kizlo/nextjs/server"

export const generateMetadata = createRootMetadata(client)
`
		const { text, changes } = apply(src)
		expect(changes.addedImports).toEqual(expect.arrayContaining(["createRootViewport", "client"]))
		expect(importCount(text, "kizlo/nextjs/server")).toBe(1)
		expect(text).toContain("createRootViewport")
	})

	it("adds a separate named import when the existing import from the module is side-effect only", () => {
		const src = `import "kizlo/nextjs/server"

export default function RootLayout() {
	return null
}
`
		const { text, changes } = apply(src)
		expect(changes.addedImports).toEqual(expect.arrayContaining(["createRootMetadata", "createRootViewport"]))
		expect(text).toContain('import "kizlo/nextjs/server"')
		expect(has(text, 'import { createRootMetadata, createRootViewport } from "kizlo/nextjs/server"')).toBe(true)
	})

	it("inserts new imports after a leading directive", () => {
		const src = `"use client"

export default function RootLayout() {
	return null
}
`
		const { text } = apply(src)
		expect(text.trimStart().startsWith('"use client"')).toBe(true)
		expect(text.indexOf('"use client"')).toBeLessThan(text.indexOf("createRootMetadata"))
	})

	it("keeps a conflicting export unless replaceConflicts is set", () => {
		const src = `import type { ReactNode } from "react"

export const generateMetadata = { title: "Mine" }

export default function RootLayout({ children }: { children: ReactNode }) {
	return <>{children}</>
}
`
		const kept = apply(src, false)
		expect(kept.changes.keptExports).toContain("generateMetadata")
		expect(kept.changes.addedExports).toContain("generateViewport")
		expect(kept.text).toContain('title: "Mine"')

		const replaced = apply(src, true)
		expect(replaced.changes.replacedExports).toContain("generateMetadata")
		expect(has(replaced.text, "export const generateMetadata = createRootMetadata(client)")).toBe(true)
		expect(replaced.text).not.toContain('title: "Mine"')
	})

	it("replaces a function-form conflict, leaving surrounding code intact", () => {
		const src = `import type { Metadata } from "next"

export async function generateMetadata(): Promise<Metadata> {
	const base = { title: "Mine" }
	return { ...base }
}

export default function RootLayout() {
	return null
}
`
		const { text, changes } = apply(src, true)
		expect(changes.replacedExports).toContain("generateMetadata")
		expect(has(text, "export const generateMetadata = createRootMetadata(client)")).toBe(true)
		// The whole old function (body included) is gone…
		expect(text).not.toContain('title: "Mine"')
		expect(text).not.toContain("export async function generateMetadata")
		// …but nothing around it is touched.
		expect(text).toContain("export default function RootLayout")
		expect(text).toContain('import type { Metadata } from "next"')
	})

	it("replaces a multi-line object const conflict and leaves the next declaration intact", () => {
		const src = `export const generateMetadata = {
	title: "Mine",
	description: "keep me out",
}

export const other = 1
`
		const { text, changes } = apply(src, true)
		expect(changes.replacedExports).toContain("generateMetadata")
		expect(has(text, "export const generateMetadata = createRootMetadata(client)")).toBe(true)
		expect(text).not.toContain('title: "Mine"')
		expect(text).toContain("export const other = 1")
	})

	it("treats a commented-out declaration as absent and adds the export", () => {
		const src = `/*
export const generateMetadata = { title: "Old" }
*/

export default function RootLayout() {
	return null
}
`
		const { text, changes } = apply(src, true)
		expect(changes.addedExports).toContain("generateMetadata")
		// The comment is left intact; our export is added as live code.
		expect(text).toContain('export const generateMetadata = { title: "Old" }')
		expect(has(text, "export const generateMetadata = createRootMetadata(client)")).toBe(true)
	})

	it("replaces a static Next counterpart (metadata) when adding generateMetadata", () => {
		const src = `import type { Metadata } from "next"

export const metadata: Metadata = { title: "Mine" }

export default function RootLayout() {
	return null
}
`
		const kept = apply(src, false)
		expect(kept.changes.keptExports).toContain("generateMetadata")
		expect(kept.text).toContain('title: "Mine"')

		const replaced = apply(src, true)
		expect(replaced.changes.replacedExports).toContain("generateMetadata")
		// The static export is gone (Next rejects both) and the dynamic one is in.
		expect(replaced.text).not.toContain("export const metadata")
		expect(has(replaced.text, "export const generateMetadata = createRootMetadata(client)")).toBe(true)
		expect(replaced.text).toContain("export default function RootLayout")
	})

	it("throws on a file that cannot be parsed rather than writing broken source", () => {
		// An initializer that opens a bracket it never closes: unparseable, so the engine must stop.
		const src = `export const generateMetadata = openBracket([

export default function RootLayout() {
	return null
}
`
		expect(() => apply(src, true)).toThrow()
	})
})

describe("resolvePatchTargetPath", () => {
	let tmp: string
	beforeEach(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-patch-"))
		fs.mkdirSync(path.join(tmp, "src/app"), { recursive: true })
	})
	afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }))

	it("finds a JS layout when the tokenized target names .tsx", () => {
		fs.writeFileSync(path.join(tmp, "src/app/layout.jsx"), "")
		expect(resolvePatchTargetPath(tmp, "src/app/layout.tsx")).toBe(path.join(tmp, "src/app/layout.jsx"))
	})

	it("prefers an exact match over a probed extension", () => {
		fs.writeFileSync(path.join(tmp, "src/app/layout.tsx"), "")
		fs.writeFileSync(path.join(tmp, "src/app/layout.js"), "")
		expect(resolvePatchTargetPath(tmp, "src/app/layout.tsx")).toBe(path.join(tmp, "src/app/layout.tsx"))
	})

	it("returns undefined when nothing matches", () => {
		expect(resolvePatchTargetPath(tmp, "src/app/layout.tsx")).toBeUndefined()
	})
})
