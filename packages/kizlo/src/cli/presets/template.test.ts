import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { adaptOwnFile, findRootLayout, ownEntries, patchEntries, readManifest, resolvePatch } from "./template"
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

describe("readManifest / adaptOwnFile / resolvePatch", () => {
	const manifest = readManifest(templateDir)

	it("splits the manifest into own files and patches", () => {
		expect(ownEntries(manifest).map((e) => e.role)).toContain("api-route")
		expect(patchEntries(manifest).map((e) => e.role)).toEqual(["root-layout"])
	})

	it("excludes starter files by default and includes them only when asked", () => {
		// init lays down only wiring, so a user's own home page/styles are never clobbered.
		const wiringRoles = ownEntries(manifest).map((e) => e.role)
		expect(wiringRoles).toContain("api-route")
		expect(wiringRoles).not.toContain("home-page")

		// create scaffolds the demo starter files on top of a fresh app.
		const allRoles = ownEntries(manifest, { includeStarter: true }).map((e) => e.role)
		expect(allRoles).toContain("api-route")
		expect(allRoles).toContain("home-page")
	})

	it("rewrites an own file's path prefix and server-import specifier to the project's", () => {
		const apiRoute = ownEntries(manifest).find((e) => e.role === "api-route")
		if (!apiRoute) throw new Error("api-route entry missing")
		const file = adaptOwnFile(templateDir, apiRoute, manifest.tokens, ctx())

		// The template's `src/app/...` prefix becomes the project's `app/...`.
		expect(file.relPath).toBe("app/api/kizlo/[[...rest]]/route.ts")
		// The template's `@/lib/kizlo/server` specifier is swapped for the resolved import.
		expect(file.contents).toContain('from "@/lib/kizlo/server"')
		expect(file.contents).not.toContain('"@/lib/kizlo/server/')
	})

	it("resolves a patch's import token against the project's server import", () => {
		const patch = patchEntries(manifest)[0]
		if (!patch) throw new Error("patch entry missing")
		const resolved = resolvePatch(patch, manifest.tokens, ctx())
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
