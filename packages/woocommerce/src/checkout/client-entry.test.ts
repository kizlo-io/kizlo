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
import { CheckoutValidationData, CheckoutRegisteredFieldReference, type CheckoutValidationIssue } from "@kizlo/woocommerce/checkout-validation"
import type { CheckoutValidationData as RootData, CheckoutRegisteredFieldReference as RootReference } from "@kizlo/woocommerce"
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Assert<T extends true> = T
export type SameContract = Assert<Equal<CheckoutValidationData, RootData>>
export type SameReference = Assert<Equal<CheckoutRegisteredFieldReference, RootReference>>
// @ts-expect-error The SDK no longer owns storefront matching.
import { resolveCheckoutValidationIssues } from "@kizlo/woocommerce/checkout-validation"
// @ts-expect-error The root entry also removes the resolver.
import { resolveCheckoutValidationIssues as rootResolver } from "@kizlo/woocommerce"
const data: CheckoutValidationData = { issues: [{ source: "billing_email", sourcePath: ["billing_address", "email"], code: "required", message: "Required", registeredFields: [], scope: "field", target: ["billingAddress", "email"] }] }
const issues: CheckoutValidationIssue[] = CheckoutValidationData.parse(data).issues
const reference: CheckoutRegisteredFieldReference = CheckoutRegisteredFieldReference.parse({ id: "plug/a.b[0]", bucket: "billingAddress" })
const ambiguous: CheckoutValidationIssue = { source: "billing_address.foo/id", sourcePath: ["billing_address.foo/id"], code: "required", message: "Required", scope: "unresolved", target: null, registeredFields: [{ id: "billing_address.foo/id", bucket: null }, { id: "foo/id", bucket: "billingAddress" }] }
// @ts-expect-error Buckets use SDK names.
const wireReference: CheckoutRegisteredFieldReference = { id: "plug/id", bucket: "billing_address" }
// @ts-expect-error The legacy dictionary is removed.
const fields = data.fields
// @ts-expect-error Raw upstream payloads are removed.
const upstream = data.upstream
// @ts-expect-error A target is literal segments, never a dotted form name.
const dotted: string = issues[0]!.target
export { issues, fields, upstream, dotted, reference, ambiguous, wireReference }
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
		expect(bundle).toContain("registeredFields")
		expect(bundle).not.toContain("resolveCheckoutValidationIssues")
		for (const entry of ["index.js", "checkout-validation.js"]) {
			const built = fs.readFileSync(path.join(PACKAGE, "dist", entry), "utf8")
			expect(built).not.toContain("resolveCheckoutValidationIssues")
		}
		expect(bundle).not.toMatch(/(?:from\s*|import\s*)["'](?:node:|kizlo["'/])/)
		expect(bundle).not.toContain("createIntegration")
		expect(bundle).not.toContain("Get cart unhandled error")
	} finally {
		fs.rmSync(dir, { recursive: true, force: true })
	}
})
