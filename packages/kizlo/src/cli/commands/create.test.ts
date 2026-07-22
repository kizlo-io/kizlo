import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { getVersion } from "../utils"
import { scaffoldTemplate } from "./create"

/**
 * The scaffold half of `create`, exercised through the local-template path
 * (`KIZLO_TEMPLATE_LOCAL_DIR`) so it never touches the network. Asserts the invariants that make a
 * copied template a standalone project: the internal manifest is removed and the monorepo-only
 * `workspace:*` Kizlo dependency is resolved to a concrete version. In-repo the local manifest carries
 * no `kizloVersion` (that is stamped at release), so resolution falls back to the running CLI version.
 */
describe("scaffoldTemplate", () => {
	const here = path.dirname(fileURLToPath(import.meta.url))
	const templatesDir = path.resolve(here, "../../../../../templates")
	let tmp: string
	const prev = process.env.KIZLO_TEMPLATE_LOCAL_DIR

	beforeEach(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-create-"))
		process.env.KIZLO_TEMPLATE_LOCAL_DIR = templatesDir
	})

	afterEach(() => {
		if (prev === undefined) delete process.env.KIZLO_TEMPLATE_LOCAL_DIR
		else process.env.KIZLO_TEMPLATE_LOCAL_DIR = prev
		fs.rmSync(tmp, { recursive: true, force: true })
	})

	it("copies the template, drops the manifest, and resolves the kizlo dependency", async () => {
		const dir = path.join(tmp, "my-app")
		await scaffoldTemplate("nextjs", dir, "my-app")

		// Wiring files land where the template holds them.
		expect(fs.existsSync(path.join(dir, "src/lib/kizlo/server/index.ts"))).toBe(true)
		expect(fs.existsSync(path.join(dir, "src/app/api/kizlo/[[...rest]]/route.ts"))).toBe(true)

		// The manifest is a build input, not something a user should find.
		expect(fs.existsSync(path.join(dir, "template.json"))).toBe(false)

		const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"))
		expect(pkg.name).toBe("my-app")
		expect(pkg.dependencies.kizlo).toBe(`^${getVersion()}`)
	})
})
