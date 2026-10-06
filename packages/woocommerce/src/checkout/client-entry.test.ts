import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { expect, test } from "vitest"

const PACKAGE = fileURLToPath(new URL("../../", import.meta.url))

test("published client entry types and browser bundle contain only validation runtime", () => {
	const cache = path.join(PACKAGE, ".cache")
	fs.mkdirSync(cache, { recursive: true })
	const dir = fs.mkdtempSync(path.join(cache, "validation-consumer-"))
	try {
		const consumer = path.join(dir, "consumer.ts")
		fs.writeFileSync(
			consumer,
			`
import { type CheckoutValidationData, type CheckoutValidationIssue, resolveCheckoutValidationIssues } from "@kizlo/woocommerce/checkout-validation"
import type { CheckoutValidationData as RootData } from "@kizlo/woocommerce"
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Assert<T extends true> = T
export type SameContract = Assert<Equal<CheckoutValidationData, RootData>>
const data: CheckoutValidationData = { issues: [{ source: "billing_email", sourcePath: ["billing_address", "email"], code: "required", message: "Required", scope: "field", target: ["billingAddress", "email"] }] }
const issues: CheckoutValidationIssue[] = resolveCheckoutValidationIssues(data, [])
// @ts-expect-error The legacy dictionary is removed.
const fields = data.fields
// @ts-expect-error Raw upstream payloads are removed.
const upstream = data.upstream
// @ts-expect-error A target is literal segments, never a dotted form name.
const dotted: string = issues[0]!.target
export { issues, fields, upstream, dotted }
`,
		)
		const program = ts.createProgram([consumer], {
			strict: true,
			skipLibCheck: true,
			noEmit: true,
			module: ts.ModuleKind.ESNext,
			moduleResolution: ts.ModuleResolutionKind.Bundler,
			target: ts.ScriptTarget.ES2022,
		})
		expect(ts.getPreEmitDiagnostics(program).map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n"))).toEqual([])
		const output = path.join(dir, "browser")
		execFileSync(
			"pnpm",
			["exec", "tsdown", consumer, "--no-config", "--platform", "browser", "--format", "esm", "--no-dts", "--out-dir", output],
			{
				cwd: PACKAGE,
				stdio: "pipe",
				timeout: 30_000,
			},
		)
		const bundle = fs
			.readdirSync(output)
			.filter((name) => name.endsWith(".js"))
			.map((name) => fs.readFileSync(path.join(output, name), "utf8"))
			.join("\n")
		expect(bundle).toContain("resolveCheckoutValidationIssues")
		expect(bundle).not.toMatch(/(?:from\s*|import\s*)["'](?:node:|kizlo["'/])/)
		expect(bundle).not.toContain("createIntegration")
		expect(bundle).not.toContain("Get cart unhandled error")
	} finally {
		fs.rmSync(dir, { recursive: true, force: true })
	}
})
