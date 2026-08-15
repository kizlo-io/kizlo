import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import ts from "typescript"
import { describe, expect, test } from "vitest"
import { generateWordPressClient } from "./generate"
import { INTROSPECTION_FIXTURE } from "./introspection.fixture"

/** Enough of `kizlo` to compile generated output against, without building the package. */
const KIZLO_MODULE = `declare module "kizlo" {
	export interface WordPressTransportOptions { credentials: { url: string; username: string; password: string } }
	export class WordPressTransport {
		constructor(options: WordPressTransportOptions)
	}
	export type WP_Success<T, S extends number, H extends Record<string, unknown>> = { data: T; status: S; headers: Headers & { __headers?: H }; error: null }
	export type WP_Failure<E extends string, S extends number, H extends Record<string, unknown>> = { data: null; status: S; headers: Headers & { __headers?: H }; error: Error & { code: E } }
	export type WP_TransportFailure<E extends string> = WP_Failure<E, 0, Record<string, never>>
	export interface WP_Endpoint<TInput, TResult> { namespace: string; path: string; method: string; pathParameters: string[]; responseContentTypes: Record<string, string | undefined>; readonly input?: TInput; readonly result?: TResult }
	export type WP_CallOptions = { signal?: AbortSignal }
	export type WP_CallArguments<I> = Record<string, never> extends I ? [input?: I, options?: WP_CallOptions] : [input: I, options?: WP_CallOptions]
	export type WP_Client<T> = { [K in keyof T]: T[K] extends WP_Endpoint<infer I, infer R> ? (...args: WP_CallArguments<I>) => Promise<R> : WP_Client<T[K]> }
	export function wpEndpoint<TInput, TResult>(definition: unknown): WP_Endpoint<TInput, TResult>
	export function createWordPressClient<T extends object>(transport: WordPressTransport, endpoints: T): WP_Client<T> & WordPressTransport
	export interface WordPressClientRegistry {}
	export type ActiveWordPressClient = WordPressClientRegistry extends { endpoints: infer O } ? (O extends object ? WP_Client<O> & WordPressTransport : WordPressTransport) : WordPressTransport
	export function createProcedure(options: unknown, handler: (options: { context: { wordpress: ActiveWordPressClient } }) => unknown): unknown
}
`

/** Calls every flavour of generated output has to accept, and the mistakes all of them must reject. */
const CLIENT_CALLS = `wordpress.postTypes.book.list({ page: 1, status: "draft" })
	wordpress.postTypes.book.list()
	wordpress.postTypes.book.retrieve({ identifier: "dune" })
	wordpress.postTypes.book.create({ title: "Dune" })
	// @ts-expect-error unknown API ID
	wordpress.postTypes.album.list({})
	// @ts-expect-error unknown endpoint
	wordpress.postTypes.book.archive({})
	// @ts-expect-error unknown input field
	wordpress.postTypes.book.list({ unknown: true })
	// @ts-expect-error invalid enum value
	wordpress.postTypes.book.list({ status: "private" })
	// @ts-expect-error invalid path value type
	wordpress.postTypes.book.retrieve({ identifier: 42 })
	// Resolved through the registry augmentation, wherever the generated output carries it.
	createProcedure({}, ({ context }) => context.wordpress.postTypes.book.list({ page: 1 }))
`

function compile(files: Record<string, string>): string[] {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-wordpress-types-"))
	for (const [name, contents] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), contents)

	const program = ts.createProgram(
		Object.keys(files).map((name) => path.join(dir, name)),
		{
			lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
			module: ts.ModuleKind.ESNext,
			moduleResolution: ts.ModuleResolutionKind.Bundler,
			noEmit: true,
			skipLibCheck: true,
			strict: true,
			target: ts.ScriptTarget.ES2022,
		},
	)
	return ts.getPreEmitDiagnostics(program).map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))
}

describe("generateWordPressClient", () => {
	test("generates deterministic named schemas and a nested endpoint tree", () => {
		const first = generateWordPressClient(INTROSPECTION_FIXTURE)
		const second = generateWordPressClient(structuredClone(INTROSPECTION_FIXTURE))

		expect(second).toEqual(first)
		expect(first).toContain("export interface WP_AcmeBook extends WP_AcmeEntity")
		expect(first).toContain("author?: WP_AcmeEntity & {")
		expect(first).toContain('status: "draft" | "publish"')
		expect(first).toContain("label?: string | null")
		expect(first).toContain("export type WP_AcmeMaybeBook = (WP_AcmeBook & WP_AcmeAudit & {")
		expect(first).toContain("attachment?: Blob")
		expect(first).toContain("}) | null")
		expect(first).toContain("export type WP_AcmeChoice = WP_AcmeBook | string | null")
		expect(first).toContain("[key: string]: number | boolean | undefined")
		expect(first).toContain("@deprecated")
		expect(first).toContain("export interface WP_PostTypesBookCreateInput")
		expect(first).toContain("export type WP_PostTypesBookCreateEndpointInput = WP_PostTypesBookCreateInput")
		expect(first).not.toContain("A shared entity.\nexport type WP_AcmeEntity")
		expect(first).toContain("export const endpoints = {")
		expect(first).toContain("\tpostTypes: {")
		expect(first).toContain("book: {")
	})

	test("emits one shape for every target: the endpoint tree, registered and bindable", () => {
		const client = generateWordPressClient(INTROSPECTION_FIXTURE)

		expect(client).toContain("export const endpoints = {")
		expect(client).toContain("export type WordPressClient = WP_Client<typeof endpoints>")
		expect(client).not.toContain("export class WordPressClient")
		expect(client).toContain(`declare module "kizlo"`)
		expect(client).toContain("endpoints: typeof endpoints")
		expect(client).toContain("export interface WP_AcmeBook extends WP_AcmeEntity")
		expect(client).toContain(`import { type WP_Client, type WP_Failure, type WP_Success, wpEndpoint } from "kizlo"`)
	})

	test("captures each endpoint's definition once, under its own documentation", () => {
		const client = generateWordPressClient(INTROSPECTION_FIXTURE)

		expect(client).toContain(
			`retrieve: wpEndpoint<WP_PostTypesBookRetrieveEndpointInput, WP_PostTypesBookRetrieveEndpointResult>({ namespace: "kizlo/v1", path: "/post-types/book/{identifier}", method: "GET", pathParameters: ["identifier"], responseContentTypes: { "200": "application/json", "404": "application/json" } }),`,
		)
		// Endpoint docs reach the shape every target compiles against, not just the types around it.
		expect(client).toMatch(/\/\*\*\n(?:\s+\* .*\n)+\s+\*\/\n\s+retrieve: wpEndpoint<WP_PostTypesBookRetrieveEndpointInput,/)
	})

	test("collapses failing statuses into one member and keeps a member per success status", () => {
		const client = generateWordPressClient(INTROSPECTION_FIXTURE)
		const result = /export type WP_PostTypesBookRetrieveEndpointResult =\n(?:\t\| .+\n)+/.exec(client)?.[0] ?? ""

		expect(result).toContain("WP_Success<")
		expect(result.match(/WP_Failure</g)).toHaveLength(1)
		expect(result).toContain("number, Record<string, never>>")
		expect(result).not.toContain("WP_TransportFailure")
	})

	test("emits a client whose calls reject unknown APIs, endpoints, fields, and values", () => {
		const client = generateWordPressClient(INTROSPECTION_FIXTURE)

		expect(
			compile({
				"kizlo.d.ts": KIZLO_MODULE,
				"wordpress.ts": client,
				// The tree an app runs on is the whole description, so calls are checked against it once bound.
				"usage.ts": `import { createProcedure, createWordPressClient, WordPressTransport } from "kizlo"
				import { endpoints } from "./wordpress"
				const transport = new WordPressTransport({ credentials: { url: "", username: "", password: "" } })
				const wordpress = createWordPressClient(transport, endpoints)
				${CLIENT_CALLS}`,
			}),
		).toEqual([])
	})

	test("emits a client a package with no server of its own can compile against as a type", () => {
		const client = generateWordPressClient(INTROSPECTION_FIXTURE)

		expect(
			compile({
				"kizlo.d.ts": KIZLO_MODULE,
				"wordpress.ts": client,
				"usage.ts": `import { createProcedure } from "kizlo"
				import type { WordPressClient } from "./wordpress"
				declare const wordpress: WordPressClient
				${CLIENT_CALLS}`,
			}),
		).toEqual([])
	})

	test("fails clearly when different schema IDs normalize to the same TypeScript name", () => {
		expect(() =>
			generateWordPressClient({
				...INTROSPECTION_FIXTURE,
				schemas: {
					...INTROSPECTION_FIXTURE.schemas,
					"acme.foo-bar": { type: "string" },
					"acme.foo_bar": { type: "string" },
				},
			}),
		).toThrow(/TypeScript name WP_AcmeFooBar/)
	})

	test("fails clearly when a namespace would shadow a transport method", () => {
		expect(() =>
			generateWordPressClient({
				...INTROSPECTION_FIXTURE,
				apis: { ...INTROSPECTION_FIXTURE.apis, get: INTROSPECTION_FIXTURE.apis["post-types.book"] as never },
			}),
		).toThrow(/namespace get would shadow the transport method/)
	})
})
