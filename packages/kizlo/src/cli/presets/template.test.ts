import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { adaptFile, changesFor, fileEntries, isExample, patchEntries, readManifest, renderNote, resolvePatch } from "./template"
import type { ScaffoldContext } from "./types"

const here = path.dirname(fileURLToPath(import.meta.url))
const templateDir = path.resolve(here, "../../../../../templates/nextjs")

/** A context standing in for a project whose App Router lives at `app` (not `src/app`). */
function ctx(): ScaffoldContext {
	return {
		kizloDir: "lib/kizlo",
		serverDirName: "server",
		serverEntryPath: "lib/kizlo/server/index.ts",
		clientPath: "lib/kizlo/client.ts",
		appDir: "app",
		// A fixed specifier so the assertion is stable regardless of the file's depth.
		serverImport: () => "@/lib/kizlo/server",
	}
}

describe("readManifest / adaptFile / resolvePatch", () => {
	const manifest = readManifest(templateDir)

	it("splits a resolved change set into files and patches", () => {
		const changes = changesFor(manifest, "init")
		expect(fileEntries(changes).map((e) => e.role)).toContain("api-route")
		expect(patchEntries(changes).map((e) => e.role)).toEqual(["root-layout", "home-page"])
	})

	it("drops examples by default and includes them only on opt-in", () => {
		// Core wiring is always present; the example-flagged demo pages appear only when asked for.
		const core = fileEntries(changesFor(manifest, "create")).map((e) => e.role)
		expect(core).toContain("api-route")
		expect(core).not.toContain("home-page")
		expect(core).not.toContain("blog-post")

		const withExamples = fileEntries(changesFor(manifest, "create", { includeExamples: true })).map((e) => e.role)
		expect(withExamples).toContain("home-page")
		expect(withExamples).toContain("blog-post")
	})

	it("gives init the additive example (base) but never create's app-owned overwrite", () => {
		// The blog route is additive, so it lives in base and init picks it up on opt-in; the home page
		// overwrites a file the user owns, so it lives in create and init never sees it.
		const roles = fileEntries(changesFor(manifest, "init", { includeExamples: true })).map((e) => e.role)
		expect(roles).toContain("blog-post")
		expect(roles).not.toContain("home-page")
	})

	it("flags the demo pages as examples and leaves core wiring unflagged", () => {
		const all = fileEntries(changesFor(manifest, "create", { includeExamples: true }))
		const examples = all.filter(isExample).map((e) => e.role)
		// Only the opt-in demo pages carry the example flag; the layout and plumbing are core wiring.
		expect(examples).toContain("home-page")
		expect(examples).toContain("blog-post")
		expect(examples).not.toContain("root-layout")
		expect(examples).not.toContain("api-route")
	})

	it("rewrites a file's path prefix and server-import specifier to the project's", () => {
		const apiRoute = fileEntries(changesFor(manifest, "init")).find((e) => e.role === "api-route")
		if (!apiRoute) throw new Error("api-route entry missing")
		const file = adaptFile(templateDir, apiRoute, manifest.conventions, ctx())

		// The template's `src/app/...` prefix becomes the project's `app/...`.
		expect(file.relPath).toBe("app/api/kizlo/[[...rest]]/route.ts")
		// The template's `@/lib/kizlo/server` specifier is swapped for the resolved import.
		expect(file.contents).toContain('from "@/lib/kizlo/server"')
		expect(file.contents).not.toContain('"@/lib/kizlo/server/')
	})

	it("resolves a patch's import token against the project's server import", () => {
		const patch = patchEntries(changesFor(manifest, "init"))[0]
		if (!patch) throw new Error("patch entry missing")
		const resolved = resolvePatch(patch, manifest.conventions, ctx())
		expect(resolved.relPath).toBe("app/layout.tsx")
		expect(resolved.imports.some((i) => i.module === "@/lib/kizlo/server" && i.names.includes("client"))).toBe(true)
		expect(resolved.exports.map((e) => e.name)).toEqual(["generateMetadata", "generateViewport"])
	})
})

describe("renderNote", () => {
	const note = { title: "Add the head component", body: 'import BaseHead from "{{importPrefix}}components/BaseHead.astro"' }

	it("substitutes {{importPrefix}} with the alias form when an alias is set", () => {
		// The alias arrives already slash-normalized (`@/`); the token resolves to that prefix verbatim.
		expect(renderNote(note, "@/").body).toBe('import BaseHead from "@/components/BaseHead.astro"')
	})

	it("substitutes {{importPrefix}} with a relative prefix when there is no alias", () => {
		expect(renderNote(note, "").body).toBe('import BaseHead from "../components/BaseHead.astro"')
	})

	it("passes the title through unchanged", () => {
		expect(renderNote(note, "@/").title).toBe("Add the head component")
	})
})
