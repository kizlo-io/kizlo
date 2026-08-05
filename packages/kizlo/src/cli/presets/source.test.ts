import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { detectTemplates, isSingleTemplate, listTemplates, locateTemplate, resolveRegistry } from "./source"

const here = path.dirname(fileURLToPath(import.meta.url))
const templatesDir = path.resolve(here, "../../../../../templates")
const tanstackTemplateDir = path.join(templatesDir, "tanstack-start-react")
const tanstackSolidTemplateDir = path.join(templatesDir, "tanstack-start-solid")

describe("listTemplates", () => {
	it("discovers every subdirectory that carries a template.json, by scanning not a hardcoded list", () => {
		const ids = listTemplates(templatesDir).map((entry) => entry.id)
		expect(ids).toContain("nextjs")
		expect(ids).toContain("astro")
		// The astro-sample project has no template.json, so it is not a template.
		expect(ids).not.toContain("astro-sample")
	})

	it("labels a template from its manifest name, falling back to its id then the directory id", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-registry-test-"))
		try {
			fs.mkdirSync(path.join(dir, "named"))
			fs.writeFileSync(path.join(dir, "named", "template.json"), JSON.stringify({ id: "x", name: "Fancy Name" }))
			fs.mkdirSync(path.join(dir, "unnamed"))
			fs.writeFileSync(path.join(dir, "unnamed", "template.json"), JSON.stringify({ id: "Solid" }))
			fs.mkdirSync(path.join(dir, "bare"))
			fs.writeFileSync(path.join(dir, "bare", "template.json"), JSON.stringify({}))

			const byId = Object.fromEntries(listTemplates(dir).map((entry) => [entry.id, entry.label]))
			expect(byId.named).toBe("Fancy Name")
			expect(byId.unnamed).toBe("Solid")
			expect(byId.bare).toBe("bare")
		} finally {
			fs.rmSync(dir, { recursive: true, force: true })
		}
	})

	it("returns nothing for a missing directory", () => {
		expect(listTemplates(path.join(templatesDir, "does-not-exist"))).toEqual([])
	})

	it("treats a directory that is itself a template (template.json at its root) as a single template", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-single-template-"))
		try {
			fs.writeFileSync(path.join(dir, "template.json"), JSON.stringify({ id: "astro", name: "Community Astro" }))

			const entries = listTemplates(dir)
			// One template, its id from the manifest id (not the random temp dir name) so `init`'s
			// detected preset can still locate it, and the whole dir is the template.
			expect(entries).toHaveLength(1)
			expect(entries[0]).toEqual({ id: "astro", label: "Community Astro", dir })
			expect(locateTemplate(dir, "astro")).toBe(dir)
		} finally {
			fs.rmSync(dir, { recursive: true, force: true })
		}
	})

	it("uses the framework-suffixed id when the TanStack Start React template is shipped standalone", () => {
		expect(listTemplates(tanstackTemplateDir)).toEqual([
			{ id: "tanstack-start-react", label: "TanStack Start (React)", dir: tanstackTemplateDir },
		])
	})

	it("uses the framework-suffixed id when the TanStack Start Solid template is shipped standalone", () => {
		expect(listTemplates(tanstackSolidTemplateDir)).toEqual([
			{ id: "tanstack-start-solid", label: "TanStack Start (Solid)", dir: tanstackSolidTemplateDir },
		])
	})
})

describe("isSingleTemplate", () => {
	it("is true for a source that is itself a template (template.json at its root)", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-single-"))
		try {
			fs.writeFileSync(path.join(dir, "template.json"), JSON.stringify({ id: "astro" }))
			expect(isSingleTemplate(dir)).toBe(true)
		} finally {
			fs.rmSync(dir, { recursive: true, force: true })
		}
	})

	it("is false for a registry of many templates", () => {
		expect(isSingleTemplate(templatesDir)).toBe(false)
	})
})

describe("locateTemplate", () => {
	it("resolves a template's directory by id", () => {
		expect(locateTemplate(templatesDir, "nextjs")).toBe(path.join(templatesDir, "nextjs"))
	})

	it("errors with the available ids when the template is missing", () => {
		expect(() => locateTemplate(templatesDir, "nope")).toThrow(/not found in the registry.*nextjs/s)
	})
})

describe("detectTemplates", () => {
	const entries = listTemplates(templatesDir)

	it("picks the template whose init.requires dep values the project has", () => {
		expect(detectTemplates(entries, { next: "^16.0.0", react: "^19.0.0" }).map((e) => e.id)).toEqual(["nextjs"])
		expect(detectTemplates(entries, { astro: "^5.0.0" }).map((e) => e.id)).toEqual(["astro"])
	})

	it("distinguishes the two TanStack Start templates by their framework-specific start package", () => {
		expect(detectTemplates(entries, { "@tanstack/react-start": "^1.0.0" }).map((e) => e.id)).toEqual(["tanstack-start-react"])
		expect(detectTemplates(entries, { "@tanstack/solid-start": "^1.0.0" }).map((e) => e.id)).toEqual(["tanstack-start-solid"])
	})

	it("returns an empty array when no template's dependencies match", () => {
		expect(detectTemplates(entries, { vue: "^3.0.0" })).toEqual([])
		expect(detectTemplates(entries, {})).toEqual([])
	})

	it("returns every template that ties for the top score so the caller can disambiguate", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-detect-tie-"))
		try {
			fs.mkdirSync(path.join(dir, "astro-blog"))
			fs.writeFileSync(
				path.join(dir, "astro-blog", "template.json"),
				JSON.stringify({ id: "astro", init: { requires: [{ kind: "dep", values: ["astro"] }] } }),
			)
			fs.mkdirSync(path.join(dir, "astro-shop"))
			fs.writeFileSync(
				path.join(dir, "astro-shop", "template.json"),
				JSON.stringify({ id: "astro", init: { requires: [{ kind: "dep", values: ["astro"] }] } }),
			)

			// Both match the single `astro` dep, so both come back, id-sorted, for the caller to pick from.
			expect(detectTemplates(listTemplates(dir), { astro: "^5.0.0" }).map((e) => e.id)).toEqual(["astro-blog", "astro-shop"])
		} finally {
			fs.rmSync(dir, { recursive: true, force: true })
		}
	})

	it("prefers the higher score over a lesser match instead of tying them", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-detect-score-"))
		try {
			fs.mkdirSync(path.join(dir, "broad"))
			fs.writeFileSync(
				path.join(dir, "broad", "template.json"),
				JSON.stringify({ id: "a", init: { requires: [{ kind: "dep", values: ["react"] }] } }),
			)
			fs.mkdirSync(path.join(dir, "specific"))
			fs.writeFileSync(
				path.join(dir, "specific", "template.json"),
				JSON.stringify({ id: "b", init: { requires: [{ kind: "dep", values: ["react", "next"] }] } }),
			)

			expect(detectTemplates(listTemplates(dir), { react: "^19.0.0", next: "^16.0.0" }).map((e) => e.id)).toEqual(["specific"])
		} finally {
			fs.rmSync(dir, { recursive: true, force: true })
		}
	})

	it("reads detection leniently — a template with a malformed manifest scores zero, never throws", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-detect-"))
		try {
			fs.mkdirSync(path.join(dir, "good"))
			fs.writeFileSync(
				path.join(dir, "good", "template.json"),
				JSON.stringify({ id: "svelte", init: { requires: [{ kind: "dep", values: ["svelte"] }] } }),
			)
			fs.mkdirSync(path.join(dir, "broken"))
			fs.writeFileSync(path.join(dir, "broken", "template.json"), "{ not valid json")

			const bothEntries = listTemplates(dir)
			expect(detectTemplates(bothEntries, { svelte: "^5.0.0" }).map((e) => e.id)).toEqual(["good"])
		} finally {
			fs.rmSync(dir, { recursive: true, force: true })
		}
	})
})

describe("resolveRegistry", () => {
	it("defaults to the remote GitHub templates registry when no arg is given", () => {
		expect(resolveRegistry()).toEqual({ local: false, source: "github:kizlo-io/kizlo/templates" })
	})

	it("treats an existing directory as a local registry", () => {
		const registry = resolveRegistry(templatesDir)
		expect(registry.local).toBe(true)
		expect(registry.source).toBe(path.resolve(templatesDir))
	})

	it("treats a non-existent value as a remote giget source", () => {
		expect(resolveRegistry("github:acme/my-registry/templates")).toEqual({
			local: false,
			source: "github:acme/my-registry/templates",
		})
	})
})
