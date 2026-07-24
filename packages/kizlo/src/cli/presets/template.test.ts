import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { adaptFile, changesFor, fileEntries, findRootLayout, isExample, patchEntries, readManifest, resolvePatch } from "./template"
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
		expect(patchEntries(changes).map((e) => e.role)).toEqual(["root-layout"])
	})

	it("gives init only base changes and create the demo pages on top", () => {
		// init lays down only base wiring, so a user's own home page/styles are never clobbered.
		const initRoles = fileEntries(changesFor(manifest, "init")).map((e) => e.role)
		expect(initRoles).toContain("api-route")
		expect(initRoles).not.toContain("home-page")

		// create scaffolds base plus the demo pages on top of a fresh app.
		const createRoles = fileEntries(changesFor(manifest, "create")).map((e) => e.role)
		expect(createRoles).toContain("api-route")
		expect(createRoles).toContain("home-page")
	})

	it("flags the demo pages as examples and leaves the core layout/styles unflagged", () => {
		const created = fileEntries(changesFor(manifest, "create"))
		const examples = created.filter(isExample).map((e) => e.role)
		// Only the opt-in demo pages carry the example flag; the layout and styles are core wiring.
		expect(examples).toContain("home-page")
		expect(examples).toContain("blog-post")
		expect(examples).not.toContain("root-layout")
		expect(examples).not.toContain("styles")
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

describe("findRootLayout", () => {
	let tmp: string
	beforeEach(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-layout-"))
	})
	afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }))

	const write = (rel: string, body: string) => {
		const abs = path.join(tmp, rel)
		fs.mkdirSync(path.dirname(abs), { recursive: true })
		fs.writeFileSync(abs, body)
		return abs
	}
	const htmlLayout = "export default function L(){return <html><body/></html>}\n"

	it("uses the hint path when it renders <html>", () => {
		const abs = write("app/layout.tsx", htmlLayout)
		expect(findRootLayout(tmp, "app", "app/layout.tsx")).toBe(abs)
	})

	it("scans for the single <html> layout when the hint misses", () => {
		write("app/layout.tsx", "export default function L(){return <div/>}\n") // not a root layout
		const abs = write("app/(marketing)/layout.tsx", htmlLayout)
		expect(findRootLayout(tmp, "app", "app/layout.tsx")).toBe(abs)
	})

	it("returns undefined on zero matches", () => {
		write("app/layout.tsx", "export default function L(){return <div/>}\n")
		expect(findRootLayout(tmp, "app", "app/layout.tsx")).toBeUndefined()
	})

	it("returns undefined when more than one layout renders <html>", () => {
		write("app/(a)/layout.tsx", htmlLayout)
		write("app/(b)/layout.tsx", htmlLayout)
		expect(findRootLayout(tmp, "app", "app/layout.tsx")).toBeUndefined()
	})
})
