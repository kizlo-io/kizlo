import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { ScaffoldContext } from "../presets"
import { changesFor, patchEntries, readManifest } from "../presets/template"
import { applyLayoutPatches } from "./_wiring"

const here = path.dirname(fileURLToPath(import.meta.url))
const templateDir = path.resolve(here, "../../../../../templates/nextjs")

/**
 * The `init` layout patch against a project that has no `src` directory — its App Router lives at the
 * repo root (`app/`, not `src/app/`). The template authors the patch target as `src/app/layout.tsx`;
 * this asserts it resolves to the project's real `app/layout.tsx` via the `appDir` token swap and lands
 * there, never creating a stray `src/` path.
 */
describe("applyLayoutPatches on a no-src project", () => {
	const manifest = readManifest(templateDir)
	let dir: string

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-init-nosrc-"))
	})
	afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

	/** A no-src project context: App Router at `app`, Kizlo home at `lib/kizlo`. */
	function scaffold(): ScaffoldContext {
		return {
			kizloDir: "lib/kizlo",
			serverDirName: "server",
			serverEntryPath: "lib/kizlo/server/index.ts",
			clientPath: "lib/kizlo/client.ts",
			appDir: "app",
			// Fixed so the assertion is stable regardless of tsconfig resolution.
			serverImport: () => "@/lib/kizlo/server",
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

		applyLayoutPatches(dir, patchEntries(changesFor(manifest, "init")), manifest.conventions, scaffold())

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
})
