import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { expect, test } from "vitest"
import { CONTRACT_BARREL, INTROSPECTION_STUB } from "../cli/daemon/generate"
import { generateWordPressClient } from "./generate"
import type { IntrospectionDocument, IntrospectionSchema } from "./introspection"

const KIZLO_TYPES = fileURLToPath(new URL("../../dist/index.d.ts", import.meta.url))
const WOOCOMMERCE_TYPES = fileURLToPath(new URL("../../../woocommerce/dist/index.d.ts", import.meta.url))

function itemSchema(field: string): IntrospectionSchema {
	return {
		type: "object",
		properties: {
			kizlo: {
				type: "object",
				required: true,
				properties: {
					custom: {
						type: "object",
						required: true,
						properties: { [field]: { type: "string", required: true } },
					},
				},
			},
		},
	}
}

function introspection(prefix: string): IntrospectionDocument {
	return {
		version: "1.1",
		hash: `sha256:${prefix.padEnd(64, "0")}`,
		schemas: {
			"woocommerce.additional-fields.address.read": {
				type: "object",
				properties: { [`${prefix}/reference`]: { type: "string" } },
				additionalProperties: false,
			},
			"woocommerce.additional-fields.address.write": {
				type: "object",
				properties: { [`${prefix}/reference`]: { type: "string", required: true } },
				additionalProperties: false,
			},
			"woocommerce.additional-fields.contact.read": {
				type: "object",
				properties: { [`${prefix}/opt-in`]: { type: "boolean" } },
				additionalProperties: false,
			},
			"woocommerce.additional-fields.checkout.read": {
				type: "object",
				properties: {
					[`${prefix}/opt-in`]: { type: "boolean" },
					[`${prefix}/slot`]: { type: "string", enum: ["", "morning", "afternoon"] },
				},
				additionalProperties: false,
			},
			"woocommerce.additional-fields.checkout.write": {
				type: "object",
				properties: {
					[`${prefix}/opt-in`]: { type: "boolean" },
					[`${prefix}/slot`]: { type: "string", enum: ["", "morning", "afternoon"] },
				},
				additionalProperties: false,
			},
			"acme.empty": { type: "object", additionalProperties: false },
			"acme.reference": { $ref: "woocommerce.additional-fields.contact.read" },
			"kizlo.post-types.page.item": itemSchema(`${prefix}Page`),
			"kizlo.post-types.post.item": itemSchema(`${prefix}Post`),
			"kizlo.post-types.product.item": itemSchema(`${prefix}Product`),
			"kizlo.taxonomies.category.item": itemSchema(`${prefix}Category`),
			"kizlo.taxonomies.post_tag.item": itemSchema(`${prefix}Tag`),
		},
		apis: {
			"kizlo.post-types.post": {
				namespace: "kizlo/v1",
				paths: {
					"/post-types/post/{identifier}": {
						retrieve: {
							method: "GET",
							errors: ["rest_not_found"],
							input: {
								params: {
									type: "object",
									properties: { identifier: { type: "string", required: true } },
								},
							},
							responses: {
								"200": { content_type: "application/json", body: { $ref: "kizlo.post-types.post.item" } },
								"404": { content_type: "application/json", body: { type: "object" } },
							},
						},
					},
				},
			},
		},
		diagnostics: [],
	}
}

function usage(prefix: string): string {
	return `import type {
		Category,
		CommonErrorCode,
		CoreProcedures,
		InferIntegrationProcedures,
		InferProcedureData,
		InferProcedureError,
		InferProcedureInput,
		InferProcedureResult,
		KizloResult,
		Page,
		Post,
		Procedure,
		ResultClient,
		Tag,
		WP_EndpointData,
		WP_EndpointInput,
		WP_EndpointPath,
		WP_EndpointResult,
	} from "kizlo"
	import { type Product, type Cart, type Checkout, type UpdateCartInput, type UpdateCheckoutInput, type ConfirmCheckoutInput, type RetryCheckoutInput, type Order, woocommerce } from "@kizlo/woocommerce"
	import type { WP_Schema } from "kizlo"
	import "./wordpress"

	type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
	type Assert<T extends true> = T
	type IsAny<T> = 0 extends 1 & T ? true : false
	type IsNever<T> = [T] extends [never] ? true : false
	type IncludesUndefined<T> = undefined extends T ? true : false

	type PostFields = Post["custom"]
	type PageFields = Page["custom"]
	type CategoryFields = Category["custom"]
	type TagFields = Tag["custom"]
	type ProductFields = Product["custom"]
	type NamedSchema = Assert<Equal<WP_Schema<"acme.reference">, { "${prefix}/opt-in"?: boolean }>>
	const emptySchema: WP_Schema<"acme.empty"> = {}
	// @ts-expect-error an empty registered schema rejects invented fields
	const badEmpty: WP_Schema<"acme.empty"> = { invented: true }
	type MissingSchema = Assert<Equal<WP_Schema<"missing", string>, string>>
	type AddressField = Assert<Equal<Cart["billingAddress"]["additionalFields"]["${prefix}/reference"], string | undefined>>
	type NativeTaxId = Assert<Equal<Cart["billingAddress"]["taxId"], string>>
	type ProjectedBillingKey = Assert<Equal<Cart["billingAddress"]["additionalFields"]["kizlo/tax-id"], undefined>>
	// @ts-expect-error published declarations retain the single-value billing projection
	const duplicateTaxId: UpdateCartInput = { billingAddress: { taxId: "GB", additionalFields: { "kizlo/tax-id": "GB" } } }
	type ShippingField = Assert<Equal<Cart["shippingAddress"]["additionalFields"]["${prefix}/reference"], string | undefined>>
	type CustomerBillingField = Assert<Equal<Customer["billing"]["additionalFields"]["${prefix}/reference"], string | undefined>>
	type CustomerShippingField = Assert<Equal<Customer["shipping"]["additionalFields"]["${prefix}/reference"], string | undefined>>
	type ContactField = Assert<Equal<Checkout["additionalFields"]["${prefix}/opt-in"], boolean | undefined>>
	type SlotField = Assert<Equal<Order["additionalFields"]["${prefix}/slot"], "" | "morning" | "afternoon" | undefined>>
	type NestedField = Assert<Equal<NonNullable<Checkout["cart"]>["billingAddress"]["additionalFields"]["${prefix}/reference"], string | undefined>>
	const updateAddress: UpdateCartInput = { shippingAddress: { additionalFields: { "${prefix}/reference": "" } } }
	const updateFields: UpdateCheckoutInput = { additionalFields: { "${prefix}/opt-in": false, "${prefix}/slot": "" } }
	// @ts-expect-error contact fields cannot be assigned to an address bucket
	const wrongLocation: UpdateCartInput = { billingAddress: { additionalFields: { "${prefix}/opt-in": true } } }
	// @ts-expect-error known checkbox fields reject string values
	const wrongType: UpdateCheckoutInput = { additionalFields: { "${prefix}/opt-in": "false" } }
	// @ts-expect-error registered select fields retain their enum
	const wrongSlot: UpdateCheckoutInput = { additionalFields: { "${prefix}/slot": "evening" } }
	const confirmFields: ConfirmCheckoutInput["additionalFields"] = { "${prefix}/opt-in": false }
	const retryFields: RetryCheckoutInput["additionalFields"] = { "${prefix}/slot": "morning" }

	type WooCommerceProcedures = InferIntegrationProcedures<[ReturnType<typeof woocommerce>]>
	type Customer = InferProcedureData<WooCommerceProcedures["woocommerce"]["customers"]["get"]>
	type WooCommerceClient = ResultClient<WooCommerceProcedures>
	type ProductGetResult = Awaited<ReturnType<WooCommerceClient["woocommerce"]["products"]["get"]>>
	type CustomerProcedureField = Assert<Equal<InferProcedureData<WooCommerceProcedures["woocommerce"]["customers"]["get"]>["billing"]["additionalFields"]["${prefix}/reference"], string | undefined>>
	type ProcedureContactField = Assert<Equal<InferProcedureData<WooCommerceProcedures["woocommerce"]["checkout"]["get"]>["additionalFields"]["${prefix}/opt-in"], boolean | undefined>>
	type ProcedureInputField = Assert<Equal<NonNullable<InferProcedureInput<WooCommerceProcedures["woocommerce"]["checkout"]["update"]>["body"]["additionalFields"]>["${prefix}/opt-in"], boolean | undefined>>
	type ProductGetFields = NonNullable<ProductGetResult["data"]>["custom"]
	type ProductListFields = InferProcedureData<
		WooCommerceProcedures["woocommerce"]["products"]["list"]
	>["items"][number]["custom"]
	type PostGetFields = InferProcedureData<CoreProcedures["posts"]["get"]>["custom"]
	type PostListFields = InferProcedureData<CoreProcedures["posts"]["list"]>["items"][number]["custom"]
	type PageGetFields = InferProcedureData<CoreProcedures["pages"]["get"]>["custom"]
	type CategoryGetFields = InferProcedureData<CoreProcedures["categories"]["get"]>["custom"]
	type TagGetFields = InferProcedureData<CoreProcedures["tags"]["get"]>["custom"]

	type PostIsExact = Assert<Equal<PostFields, { ${prefix}Post: string }>>
	type PageIsExact = Assert<Equal<PageFields, { ${prefix}Page: string }>>
	type CategoryIsExact = Assert<Equal<CategoryFields, { ${prefix}Category: string }>>
	type TagIsExact = Assert<Equal<TagFields, { ${prefix}Tag: string }>>
	type ProductIsExact = Assert<Equal<ProductFields, { ${prefix}Product: string }>>
	type ProductGetIsExact = Assert<Equal<ProductGetFields, { ${prefix}Product: string }>>
	type ProductListIsExact = Assert<Equal<ProductListFields, { ${prefix}Product: string }>>
	type PostGetIsExact = Assert<Equal<PostGetFields, { ${prefix}Post: string }>>
	type PostListIsExact = Assert<Equal<PostListFields, { ${prefix}Post: string }>>
	type PageGetIsExact = Assert<Equal<PageGetFields, { ${prefix}Page: string }>>
	type CategoryGetIsExact = Assert<Equal<CategoryGetFields, { ${prefix}Category: string }>>
	type TagGetIsExact = Assert<Equal<TagGetFields, { ${prefix}Tag: string }>>
	type PostIsNotAny = Assert<Equal<IsAny<PostFields>, false>>
	type PostIsNotNever = Assert<Equal<IsNever<PostFields>, false>>
	type PostIsNotUndefined = Assert<Equal<IncludesUndefined<PostFields>, false>>
	type ProductIsNotAny = Assert<Equal<IsAny<ProductFields>, false>>
	type ProductIsNotNever = Assert<Equal<IsNever<ProductFields>, false>>
	type ProductIsNotUndefined = Assert<Equal<IncludesUndefined<ProductFields>, false>>

	type RawPathIsExact = Assert<Equal<WP_EndpointPath, "kizlo.postTypes.post.retrieve">>
	type RawInputIsExact = Assert<Equal<WP_EndpointInput<"kizlo.postTypes.post.retrieve">, { params: { identifier: string } }>>
	type RawDataIsNotAny = Assert<Equal<IsAny<WP_EndpointData<"kizlo.postTypes.post.retrieve">>, false>>
	type RawResultIsNotAny = Assert<Equal<IsAny<WP_EndpointResult<"kizlo.postTypes.post.retrieve">>, false>>
	// @ts-expect-error procedure names are not raw WordPress operation paths
	type FakeRawPath = WP_EndpointData<"woocommerce.products.get">

	type InvoiceProcedure = Procedure<"api", { params: { id: string } }, { total: number }, { INVOICE_MISSING: { status: 404 } }>
	type ProcedureInputIsExact = Assert<Equal<InferProcedureInput<InvoiceProcedure>, { params: { id: string } }>>
	type ProcedureDataIsExact = Assert<Equal<InferProcedureData<InvoiceProcedure>, { total: number }>>
	type ProcedureErrorsAreExact = Assert<
		Equal<InferProcedureError<InvoiceProcedure>["code"], CommonErrorCode | "INVOICE_MISSING">
	>
	type ProcedureResultIsExact = Assert<
		Equal<
			InferProcedureResult<InvoiceProcedure>,
			KizloResult<{ total: number }, { INVOICE_MISSING: { status: 404 } }>
		>
	>

	export type {
		CategoryIsExact,
		CategoryGetIsExact,
		FakeRawPath,
		PageIsExact,
		PageGetIsExact,
		PostIsExact,
		PostGetIsExact,
		PostListIsExact,
		PostIsNotAny,
		PostIsNotNever,
		PostIsNotUndefined,
		ProcedureDataIsExact,
		ProcedureErrorsAreExact,
		ProcedureInputIsExact,
		ProcedureResultIsExact,
		ProductIsExact,
		ProductGetIsExact,
		ProductListIsExact,
		ProductIsNotAny,
		ProductIsNotNever,
		ProductIsNotUndefined,
		RawDataIsNotAny,
		RawInputIsExact,
		RawPathIsExact,
		RawResultIsNotAny,
		TagIsExact,
		TagGetIsExact,
	}
	`
}

const STUB_USAGE = `import type { Category, CoreProcedures, InferIntegrationProcedures, InferProcedureData, Page, Post, ResultClient, Tag } from "kizlo"
	import { type Product, type Cart, type Checkout, type UpdateCartInput, type UpdateCheckoutInput, type ConfirmCheckoutInput, type RetryCheckoutInput, type Order, woocommerce } from "@kizlo/woocommerce"
	import type { WP_Schema } from "kizlo"
	import "./wordpress"

	type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
	type Assert<T extends true> = T
	type PostCompiles = Assert<Equal<Post["custom"], Record<string, unknown>>>
	type PageCompiles = Assert<Equal<Page["custom"], Record<string, unknown>>>
	type CategoryCompiles = Assert<Equal<Category["custom"], Record<string, unknown>>>
	type TagCompiles = Assert<Equal<Tag["custom"], Record<string, unknown>>>
	type ProductCompiles = Assert<Equal<Product["custom"], Record<string, unknown>>>
	type StubAddressFields = Assert<Equal<Cart["billingAddress"]["additionalFields"]["future/field"], string | boolean | undefined>>
	type StubProjectedField = Assert<Equal<Cart["billingAddress"]["additionalFields"]["kizlo/tax-id"], undefined>>
	type StubCheckoutFields = Assert<Equal<Checkout["additionalFields"], Record<string, string | boolean | undefined>>>
	type MissingSchema = Assert<Equal<WP_Schema<"missing", string>, string>>
	type WooCommerceProcedures = InferIntegrationProcedures<[ReturnType<typeof woocommerce>]>
	type Customer = InferProcedureData<WooCommerceProcedures["woocommerce"]["customers"]["get"]>
	type WooCommerceClient = ResultClient<WooCommerceProcedures>
	type ProductGetResult = Awaited<ReturnType<WooCommerceClient["woocommerce"]["products"]["get"]>>
	type ProductGetCompiles = Assert<Equal<NonNullable<ProductGetResult["data"]>["custom"], Record<string, unknown>>>
	type ProductListCompiles = Assert<
		Equal<
			InferProcedureData<WooCommerceProcedures["woocommerce"]["products"]["list"]>["items"][number]["custom"],
			Record<string, unknown>
		>
	>
	type PostGetCompiles = Assert<
		Equal<InferProcedureData<CoreProcedures["posts"]["get"]>["custom"], Record<string, unknown>>
	>
	type PostListCompiles = Assert<
		Equal<InferProcedureData<CoreProcedures["posts"]["list"]>["items"][number]["custom"], Record<string, unknown>>
	>

	export type {
		CategoryCompiles,
		PageCompiles,
		PostCompiles,
		PostGetCompiles,
		PostListCompiles,
		ProductCompiles,
		ProductGetCompiles,
		ProductListCompiles,
		TagCompiles,
	}
`

function compile(dir: string, entries: readonly string[] = ["introspection.ts", "usage.ts"]): string[] {
	const options: ts.CompilerOptions = {
		baseUrl: dir,
		lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		noEmit: true,
		paths: {
			"@kizlo/woocommerce": [WOOCOMMERCE_TYPES],
			kizlo: [KIZLO_TYPES],
		},
		resolveJsonModule: true,
		skipLibCheck: true,
		strict: true,
		target: ts.ScriptTarget.ES2022,
	}
	const files = entries.map((entry) => path.join(dir, entry))
	const program = ts.createProgram(files, options)
	return ts
		.getPreEmitDiagnostics(program)
		.map((diagnostic) => `${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`)
}

test("published declarations retain generated registries across regeneration", () => {
	expect(fs.existsSync(KIZLO_TYPES)).toBe(true)
	expect(fs.existsSync(WOOCOMMERCE_TYPES)).toBe(true)

	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-declaration-consumer-"))
	try {
		fs.writeFileSync(path.join(dir, "introspection.ts"), INTROSPECTION_STUB)
		fs.writeFileSync(path.join(dir, "usage.ts"), STUB_USAGE)
		expect(compile(dir)).toEqual([])

		fs.writeFileSync(path.join(dir, "introspection.ts"), generateWordPressClient(introspection("initial")))
		fs.writeFileSync(path.join(dir, "usage.ts"), usage("initial"))
		expect(compile(dir)).toEqual([])

		// Simulate a schema change in the consuming app. Only its generated module and call-site
		// expectations change; both packages remain on the declarations built before this test.
		fs.writeFileSync(path.join(dir, "introspection.ts"), generateWordPressClient(introspection("updated")))
		fs.writeFileSync(path.join(dir, "usage.ts"), usage("updated"))
		expect(compile(dir)).toEqual([])
	} finally {
		fs.rmSync(dir, { force: true, recursive: true })
	}
}, 30_000)

const SERVER_PROCEDURES = `import type { Procedure } from "kizlo"

export const procedures = {} as {
	billing: {
		invoices: {
			get: Procedure<"api", { params: { id: string } }, { total: number }, { INVOICE_MISSING: { status: 404 } }>
		}
	}
	seo: {
		robots: Procedure<"internal", void, { rules: string }>
	}
}
`

const REGISTERED_USAGE = `import { type CommonErrorCode, createKizloClient } from "kizlo"
	import { contract } from "./generated"

	type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
	type Assert<T extends true> = T
	type IsAny<T> = 0 extends 1 & T ? true : false

	const client = createKizloClient(contract).client

	type Invoice = typeof client.billing.invoices.get
	type InvoiceData = NonNullable<Awaited<ReturnType<Invoice>>["data"]>

	type ClientIsNotAny = Assert<Equal<IsAny<typeof client>, false>>
	type InputIsExact = Assert<Equal<Parameters<Invoice>[0], { params: { id: string } }>>
	type DataIsExact = Assert<Equal<InvoiceData, { total: number }>>
	type ErrorIsExact = Assert<
		Equal<NonNullable<Awaited<ReturnType<Invoice>>["error"]>["code"], CommonErrorCode | "INVOICE_MISSING">
	>

	// @ts-expect-error internal procedures never reach the browser client
	const internalIsAbsent = client.seo
	// @ts-expect-error a namespace the registered procedures do not declare
	const unknownIsAbsent = client.reviews

	export type { ClientIsNotAny, DataIsExact, ErrorIsExact, InputIsExact }
	export { internalIsAbsent, unknownIsAbsent }
	`

const UNREGISTERED_USAGE = `import { createKizloClient } from "kizlo"

	type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
	type Assert<T extends true> = T
	type IsAny<T> = 0 extends 1 & T ? true : false

	const client = createKizloClient({}).client

	type ClientIsAny = Assert<Equal<IsAny<typeof client>, true>>

	// A second property access is what distributing \`any\` through the mapped types used to break.
	const nested = client.woocommerce.cart.items.add

	export type { ClientIsAny }
	export { nested }
	`

/**
 * The registry has to resolve against the app's own generated barrel, not the contract this repo
 * happens to hold, so the proof has to be a separate program compiled against the built declarations.
 * An unregistered app is a second program for the same reason: a module augmentation is global to the
 * program it appears in, so one program cannot be both registered and unregistered.
 */
test("published declarations type the browser client from the app's own registered procedures", () => {
	expect(fs.existsSync(KIZLO_TYPES)).toBe(true)

	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-procedure-registry-"))
	try {
		fs.mkdirSync(path.join(dir, "generated"))
		fs.writeFileSync(path.join(dir, "index.ts"), SERVER_PROCEDURES)
		fs.writeFileSync(path.join(dir, "generated", "index.ts"), CONTRACT_BARREL)
		fs.writeFileSync(path.join(dir, "generated", "contract.json"), "{}\n")
		fs.writeFileSync(path.join(dir, "generated", "introspection.ts"), INTROSPECTION_STUB)
		fs.writeFileSync(path.join(dir, "usage.ts"), REGISTERED_USAGE)
		expect(compile(dir, ["usage.ts"])).toEqual([])
	} finally {
		fs.rmSync(dir, { force: true, recursive: true })
	}
}, 30_000)

test("published declarations leave an app without a generated barrel compiling on `any`", () => {
	expect(fs.existsSync(KIZLO_TYPES)).toBe(true)

	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-procedure-registry-empty-"))
	try {
		fs.writeFileSync(path.join(dir, "usage.ts"), UNREGISTERED_USAGE)
		expect(compile(dir, ["usage.ts"])).toEqual([])
	} finally {
		fs.rmSync(dir, { force: true, recursive: true })
	}
}, 30_000)

test("empty registered buckets keep scalar reads and reject invented literal writes", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-empty-fields-consumer-"))
	try {
		const document = introspection("empty")
		for (const id of Object.keys(document.schemas)) {
			if (id.startsWith("woocommerce.additional-fields."))
				document.schemas[id] = { type: "object", properties: {}, additionalProperties: false }
		}
		fs.writeFileSync(path.join(dir, "introspection.ts"), generateWordPressClient(document))
		fs.writeFileSync(
			path.join(dir, "usage.ts"),
			`import type { Cart, UpdateCartInput, UpdateCheckoutInput } from "@kizlo/woocommerce"
		import type { WP_Schema } from "kizlo"
		import "./wordpress"
		const empty: WP_Schema<"woocommerce.additional-fields.address.read"> = {}
		const update: UpdateCartInput = { billingAddress: { additionalFields: {} } }
		const checkout: UpdateCheckoutInput = { additionalFields: {} }
		declare const cart: Cart
		const dynamic: string | boolean | undefined = cart.billingAddress.additionalFields["future/field"]
		// @ts-expect-error a present empty registry has no registered write keys
		const invented: UpdateCartInput = { shippingAddress: { additionalFields: { "future/field": true } } }
		export { empty, update, checkout, dynamic, invented }`,
		)
		expect(compile(dir)).toEqual([])
	} finally {
		fs.rmSync(dir, { force: true, recursive: true })
	}
}, 30_000)

test("registered browser checkout errors retain references through published declarations", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-checkout-registry-"))
	try {
		fs.mkdirSync(path.join(dir, "generated"))
		fs.writeFileSync(
			path.join(dir, "index.ts"),
			`import type { InferIntegrationProcedures } from "kizlo"
		import { woocommerce } from "@kizlo/woocommerce"
		export declare const procedures: InferIntegrationProcedures<[ReturnType<typeof woocommerce>]>
		`,
		)
		fs.writeFileSync(path.join(dir, "generated", "index.ts"), CONTRACT_BARREL)
		fs.writeFileSync(path.join(dir, "generated", "contract.json"), "{}\n")
		fs.writeFileSync(path.join(dir, "generated", "introspection.ts"), INTROSPECTION_STUB)
		fs.writeFileSync(
			path.join(dir, "usage.ts"),
			`import { createKizloClient, type ActiveKizloClient } from "kizlo"
		import type { CheckoutValidationIssue, CheckoutRegisteredFieldReference } from "@kizlo/woocommerce"
		import { contract } from "./generated"
		type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
		type Assert<T extends true> = T
		const client = createKizloClient(contract).client
		type Result = Awaited<ReturnType<typeof client.woocommerce.checkout.confirm>>
		type Error = Extract<NonNullable<Result["error"]>, { code: "CHECKOUT_VALIDATION_FAILED" }>
		type Issue = Error["data"]["issues"][number]
		declare const issue: Issue
		const sdkIssue: CheckoutValidationIssue = issue
		declare const standalone: CheckoutValidationIssue
		const clientIssue: Issue = standalone
		if (issue.scope === "unresolved") {
			const unresolved: null = issue.target
		} else {
			const target: string[] = issue.target
		}
		type SameBucket = Assert<Equal<Issue["registeredFields"][number]["bucket"], CheckoutRegisteredFieldReference["bucket"]>>
		type LiteralId = Assert<Equal<Issue["registeredFields"][number]["id"], string>>
		const clientReference: Issue["registeredFields"][number] = { id: "plugin/a.b[0]", bucket: "billingAddress" }
		// @ts-expect-error consumer references reject WooCommerce bucket names
		const wireReference: Issue["registeredFields"][number] = { id: "plugin/id", bucket: "billing_address" }
		type SameActiveClient = Assert<Equal<typeof client, ActiveKizloClient>>
		declare const error: Error
		const references: CheckoutRegisteredFieldReference[] = error.data.issues[0]!.registeredFields
		// @ts-expect-error the legacy dictionary is removed
		const fields = error.data.fields
		// @ts-expect-error raw WooCommerce payloads are private
		const upstream = error.data.upstream
		// @ts-expect-error target paths are literal segments
		const dotted: string = error.data.issues[0]!.target
		`,
		)
		expect(compile(dir, ["usage.ts"])).toEqual([])
	} finally {
		fs.rmSync(dir, { force: true, recursive: true })
	}
}, 30_000)
