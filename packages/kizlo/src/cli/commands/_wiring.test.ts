import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { ScaffoldContext } from "../presets"
import { changesFor, patchEntries, readManifest } from "../presets/template"
import { applyProjectPatches, kizloConfigTemplate } from "./_wiring"

describe("kizloConfigTemplate", () => {
	it("emits the dir and alias with no local block when local WordPress is off", () => {
		const config = kizloConfigTemplate("src/lib/kizlo", "@")
		expect(config).toContain('dir: "src/lib/kizlo"')
		expect(config).toContain('alias: "@/"')
		expect(config).not.toContain("local")
	})

	it("emits a `local: { dev, test }` block for a local-WordPress scaffold", () => {
		const config = kizloConfigTemplate("src/lib/kizlo", "@", true)
		expect(config).toContain('dir: "src/lib/kizlo"')
		expect(config).toContain("local: { dev: {}, test: {} }")
		// No trace of the removed flat keys the redesign dropped.
		expect(config).not.toContain("dev: { local")
		expect(config).not.toContain("wordpressClientDir")
	})
})

const here = path.dirname(fileURLToPath(import.meta.url))
const templateDir = path.resolve(here, "../../../../../templates/nextjs")

/**
 * The `init` layout patch against a project that has no `src` directory — its App Router lives at the
 * repo root (`app/`, not `src/app/`). The template authors the patch target as `src/app/layout.tsx`;
 * this asserts it resolves to the project's real `app/layout.tsx` via the `src/` strip (no-src project) and lands
 * there, never creating a stray `src/` path.
 */
describe("applyProjectPatches on a no-src project", () => {
	const manifest = readManifest(templateDir)
	let dir: string

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-init-nosrc-"))
	})
	afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

	/** A no-src project context: App Router at `app`, Kizlo home at `lib/kizlo`. */
	function scaffold(): ScaffoldContext {
		return {
			kizloPath: "lib/kizlo",
			serverDirName: "server",
			serverEntryPath: "lib/kizlo/server/index.ts",
			clientPath: "lib/kizlo/client.ts",
			hasSrcDir: false,
			// Fixed so the assertion is stable regardless of tsconfig resolution.
			serverImport: () => "@/lib/kizlo/server",
			importFrom: (targetRel: string) => `@/${targetRel.replace(/^src\//, "")}`,
		}
	}

	it("adapts the template's src/app path to the project's root app/ and patches the layout in place", () => {
		// The user's own root layout, at app/layout.tsx, with their static metadata.
		fs.mkdirSync(path.join(dir, "app"), { recursive: true })
		fs.writeFileSync(
			path.join(dir, "app/layout.tsx"),
			`import type { Metadata } from "next"

export const metadata: Metadata = { title: "Acme" }

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	)
}
`,
		)

		applyProjectPatches(dir, patchEntries(changesFor(manifest, "init")), manifest.config, scaffold())

		// No stray src/ path is created — the patch resolves to the project's real app dir.
		expect(fs.existsSync(path.join(dir, "src/app/layout.tsx"))).toBe(false)

		const layout = fs.readFileSync(path.join(dir, "app/layout.tsx"), "utf8")
		// Kizlo's SEO wiring is merged into the user's own layout.
		expect(layout).toContain("createRootMetadata")
		expect(layout).toContain("generateMetadata")
		expect(layout).toContain("generateViewport")
		// The {{serverImport}} token resolved to the project's specifier.
		expect(layout).toContain('from "@/lib/kizlo/server"')
	})

	it("wires homepage SEO metadata into the user's own home page", () => {
		fs.mkdirSync(path.join(dir, "app"), { recursive: true })
		fs.writeFileSync(
			path.join(dir, "app/page.tsx"),
			`export default function Home() {
	return <main>Hello</main>
}
`,
		)

		applyProjectPatches(dir, patchEntries(changesFor(manifest, "init")), manifest.config, scaffold())

		const home = fs.readFileSync(path.join(dir, "app/page.tsx"), "utf8")
		expect(home).toContain("createHomeMetadata")
		expect(home).toContain("generateMetadata")
		expect(home).toContain('from "@/lib/kizlo/server"')
	})

	it("never scans for a stand-in: an absent home page is left for the user, not wired elsewhere", () => {
		// Only a layout exists — the home page is missing from its declared path.
		fs.mkdirSync(path.join(dir, "app"), { recursive: true })
		fs.writeFileSync(
			path.join(dir, "app/layout.tsx"),
			`export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	)
}
`,
		)

		applyProjectPatches(dir, patchEntries(changesFor(manifest, "init")), manifest.config, scaffold())

		// No stray page.tsx is created, and the layout is never used as a stand-in for the home page.
		expect(fs.existsSync(path.join(dir, "app/page.tsx"))).toBe(false)
		expect(fs.readFileSync(path.join(dir, "app/layout.tsx"), "utf8")).not.toContain("createHomeMetadata")
	})
})

/**
 * A `note`-mode patch (Astro's `output: "server"` + adapter, which lives inside `defineConfig(...)` and
 * so can't be auto-merged) must never touch the target file — it is a printed manual step only. This
 * guards that even when the target exists, `applyProjectPatches` leaves it byte-for-byte unchanged.
 */
describe("applyProjectPatches with a note-mode patch", () => {
	const astroTemplateDir = path.resolve(here, "../../../../../templates/astro")
	const manifest = readManifest(astroTemplateDir)
	let dir: string

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-init-note-"))
	})
	afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

	function scaffold(): ScaffoldContext {
		return {
			kizloPath: "src/lib/kizlo",
			serverDirName: "server",
			serverEntryPath: "src/lib/kizlo/server/index.ts",
			clientPath: "src/lib/kizlo/client.ts",
			hasSrcDir: true,
			serverImport: () => "@/lib/kizlo/server",
			importFrom: (targetRel: string) => `@/${targetRel.replace(/^src\//, "")}`,
		}
	}

	it("leaves the user's astro.config.mjs untouched", () => {
		const original = `import { defineConfig } from "astro/config"\n\nexport default defineConfig({})\n`
		fs.writeFileSync(path.join(dir, "astro.config.mjs"), original)

		const notePatches = patchEntries(changesFor(manifest, "init"))
		// The astro template declares exactly one init patch, and it is note-mode.
		expect(notePatches).toHaveLength(1)
		expect(notePatches[0]?.mode).toBe("note")

		applyProjectPatches(dir, notePatches, manifest.config, scaffold())

		expect(fs.readFileSync(path.join(dir, "astro.config.mjs"), "utf8")).toBe(original)
	})
})
