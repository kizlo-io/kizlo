import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { generateWordPressModule } from "./generate"
import type { IntrospectionDocument, IntrospectionSchema } from "./introspection"
import { assertGeneratedClientCompiles, type GeneratedClientCheck, GeneratedClientTypeError } from "./typecheck"

/**
 * Enough of `kizlo` for a module of named schemas to resolve against. A document with no APIs
 * names nothing else, which keeps the stub to the two declarations the generator always emits.
 */
const KIZLO_TYPES = `export type WP_Client<T> = T
export interface WordPressClientRegistry {}
`

function kizloTypes(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-typecheck-"))
	const file = path.join(dir, "index.d.ts")
	fs.writeFileSync(file, KIZLO_TYPES)
	return file
}

function document(schemas: Record<string, IntrospectionSchema>): IntrospectionDocument {
	return { version: "1.0", hash: `sha256:${"a".repeat(64)}`, schemas, apis: {}, diagnostics: [] }
}

async function check(schemas: Record<string, IntrospectionSchema>): Promise<GeneratedClientCheck> {
	return assertGeneratedClientCompiles(generateWordPressModule(document(schemas)), { kizloTypes: kizloTypes() })
}

async function refusal(schemas: Record<string, IntrospectionSchema>): Promise<GeneratedClientTypeError> {
	try {
		await check(schemas)
	} catch (thrown) {
		return thrown as GeneratedClientTypeError
	}
	throw new Error("Expected the generated client to be refused.")
}

describe("assertGeneratedClientCompiles", () => {
	test("accepts a document whose declarations compile", async () => {
		await expect(
			check({
				"acme.entity": { type: "object", properties: { id: { type: "integer", required: true } } },
				"acme.book": {
					type: "object",
					$extends: "acme.entity",
					// Narrowing what it inherits is legal, and has to stay legal.
					properties: { id: { type: "integer", required: true }, title: { type: "string" } },
				},
			}),
		).resolves.toBe("checked")
	})

	test("accepts a schema extending a nullable parent, which generates as an intersection", async () => {
		await expect(
			check({
				"acme.base": { type: "object", nullable: true, properties: { a: { type: "string", required: true } } },
				"acme.child": { type: "object", $extends: "acme.base", properties: { b: { type: "string" } } },
			}),
		).resolves.toBe("checked")
	})

	test("accepts a schema extending a reference to a nullable parent", async () => {
		await expect(
			check({
				"acme.base": { type: "object", nullable: true, properties: { a: { type: "string", required: true } } },
				"acme.alias": { $ref: "acme.base" },
				"acme.child": { type: "object", $extends: "acme.alias", properties: { b: { type: "string" } } },
			}),
		).resolves.toBe("checked")
	})

	test("refuses a schema that makes an inherited property optional, and names it", async () => {
		const failure = check({
			"acme.entity": { type: "object", properties: { id: { type: "integer", required: true } } },
			"acme.loose": { type: "object", $extends: "acme.entity", properties: { id: { type: "integer" } } },
		})

		await expect(failure).rejects.toThrow(GeneratedClientTypeError)
		await expect(failure).rejects.toThrow(/schema "acme\.loose": Interface 'WP_AcmeLoose' incorrectly extends/)
	})

	test("reports the schema rather than the offset the compiler gives", async () => {
		const error = await refusal({
			"acme.entity": { type: "object", properties: { label: { type: "string", required: true } } },
			"acme.widened": {
				type: "object",
				$extends: "acme.entity",
				properties: { label: { type: "string", required: true, nullable: true } },
			},
		})

		expect(error.diagnostics).toHaveLength(1)
		expect(error.diagnostics[0]).toMatch(/^schema "acme\.widened": /)
		expect(error.message).toContain("does not compile, so it was not written")
	})

	test("passes when the compiler cannot be reached, rather than failing generation", async () => {
		await expect(
			assertGeneratedClientCompiles(generateWordPressModule(document({})), { kizloTypes: "/nonexistent/index.d.ts" }),
		).resolves.toBe("skipped")
	})
})
