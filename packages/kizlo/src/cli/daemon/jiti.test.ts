import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, expect, test } from "vitest"
import { importConfigModule } from "./jiti"

const workspaces: string[] = []
function workspace(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-config-import-"))
	workspaces.push(dir)
	return dir
}
afterEach(() => {
	for (const dir of workspaces.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

test("loads TypeScript configuration and its real local dependencies", async () => {
	const dir = workspace()
	fs.writeFileSync(path.join(dir, "value.ts"), 'export const output: string = "generated"')
	const entry = path.join(dir, "kizlo.config.ts")
	fs.writeFileSync(entry, 'import { output } from "./value"; export default { dir: output }')
	expect(await importConfigModule(dir, entry)).toMatchObject({ default: { dir: "generated" } })
})

test("missing imports are reported instead of generating values from no-op stubs", async () => {
	const dir = workspace()
	const entry = path.join(dir, "kizlo.config.ts")
	fs.writeFileSync(entry, 'import { output } from "missing-config-dependency"; export default { dir: output }')
	await expect(importConfigModule(dir, entry)).rejects.toThrow("missing-config-dependency")
})

test("a reload reads the updated configuration", async () => {
	const dir = workspace()
	const entry = path.join(dir, "kizlo.config.ts")
	fs.writeFileSync(entry, 'export default { dir: "before" }')
	expect(await importConfigModule(dir, entry)).toMatchObject({ default: { dir: "before" } })
	fs.writeFileSync(entry, 'export default { dir: "after" }')
	expect(await importConfigModule(dir, entry)).toMatchObject({ default: { dir: "after" } })
})
