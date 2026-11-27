import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { expect, test } from "vitest"
import { generateWordPressClient, generateWordPressModule } from "./generate"
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
	return `import type { Category, Page, Post, Tag, WP_Schema, WP_EndpointInput, WP_EndpointResult } from "kizlo"
 import type { Product, Cart, Checkout, UpdateCartAddressInput, UpdateCheckoutInput, ConfirmCheckoutInput, RetryCheckoutInput, Order } from "@kizlo/woocommerce"
 import { createServerClient } from "kizlo/server"
 import { introspection } from "./introspection"
 type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
 type Assert<T extends true> = T
 type IsAny<T> = 0 extends 1 & T ? true : false
 const client = createServerClient({ credentials: { url: "https://wp.example", username: "a", password: "b" }, endpoints: introspection })
 type Retrieve = typeof client.kizlo.postTypes.post.retrieve
 type Input = Assert<Equal<Parameters<Retrieve>[0], { params: { identifier: string } }>>
 type Result = Assert<Equal<Awaited<ReturnType<Retrieve>>, WP_EndpointResult<"kizlo.postTypes.post.retrieve">>>
 // @ts-expect-error identifiers are strings
 client.kizlo.postTypes.post.retrieve({ params: { identifier: 7 } })
 // @ts-expect-error unknown namespaces are never accepted
 client.future
 type PostFields = Assert<Equal<NonNullable<Post["custom"]>, { ${prefix}Post: string }>>
 type PageFields = Assert<Equal<NonNullable<Page["custom"]>, { ${prefix}Page: string }>>
 type CategoryFields = Assert<Equal<Category["custom"], { ${prefix}Category: string }>>
 type TagFields = Assert<Equal<Tag["custom"], { ${prefix}Tag: string }>>
 type ProductFields = Assert<Equal<Product["custom"], { ${prefix}Product: string }>>
 type NotAny = Assert<Equal<IsAny<Post["custom"]>, false>>
 type Named = Assert<Equal<WP_Schema<"acme.reference">, { "${prefix}/opt-in"?: boolean }>>
 const empty: WP_Schema<"acme.empty"> = {}
 // @ts-expect-error closed empty schemas reject invented fields
 const invented: WP_Schema<"acme.empty"> = { invented: true }
 type Address = Assert<Equal<Cart["billingAddress"]["additionalFields"]["${prefix}/reference"], string | undefined>>
 type Shipping = Assert<Equal<Cart["shippingAddress"]["additionalFields"]["${prefix}/reference"], string | undefined>>
 type Contact = Assert<Equal<Checkout["additionalFields"]["${prefix}/opt-in"], boolean | undefined>>
 type Slot = Assert<Equal<Order["additionalFields"]["${prefix}/slot"], "" | "morning" | "afternoon" | undefined>>
 const update: UpdateCheckoutInput = { additionalFields: { "${prefix}/opt-in": false, "${prefix}/slot": "" } }
 // @ts-expect-error checkbox fields reject strings
 const wrongType: UpdateCheckoutInput = { additionalFields: { "${prefix}/opt-in": "false" } }
 // @ts-expect-error registered enum is preserved
 const wrongSlot: UpdateCheckoutInput = { additionalFields: { "${prefix}/slot": "evening" } }
 // @ts-expect-error native billing projection rejects a duplicate raw tax ID
 const duplicate: UpdateCartAddressInput = { billingAddress: { taxId: "GB", additionalFields: { "kizlo/tax-id": "GB" } } }
 const confirm: ConfirmCheckoutInput["additionalFields"] = { "${prefix}/opt-in": false }
 const retry: RetryCheckoutInput["additionalFields"] = { "${prefix}/slot": "morning" }
 `
}

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
			"kizlo/server": [fileURLToPath(new URL("../../dist/server.d.ts", import.meta.url))],
			"kizlo/browser": [fileURLToPath(new URL("../../dist/browser.d.ts", import.meta.url))],
			"kizlo/nextjs/server": [fileURLToPath(new URL("../../dist/nextjs/server.d.ts", import.meta.url))],
			"kizlo/tanstack-start/cloudflare": [fileURLToPath(new URL("../../dist/tanstack-start/cloudflare.d.ts", import.meta.url))],
			"kizlo/tanstack-start/server": [fileURLToPath(new URL("../../dist/tanstack-start/server.d.ts", import.meta.url))],
			"kizlo/tanstack-start/react/server": [fileURLToPath(new URL("../../dist/tanstack-start/react/server.d.ts", import.meta.url))],
			"@tanstack/react-start": [fileURLToPath(new URL("../../node_modules/@tanstack/react-start/dist/esm/index.d.ts", import.meta.url))],
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
			`import type { Cart, UpdateCartAddressInput, UpdateCheckoutInput } from "@kizlo/woocommerce"
		import type { WP_Schema } from "kizlo"
		import "./introspection"
		const empty: WP_Schema<"woocommerce.additional-fields.address.read"> = {}
		const update: UpdateCartAddressInput = { billingAddress: { additionalFields: {} } }
		const checkout: UpdateCheckoutInput = { additionalFields: {} }
		declare const cart: Cart
		const dynamic: string | boolean | undefined = cart.billingAddress.additionalFields["future/field"]
		// @ts-expect-error a present empty registry has no registered write keys
		const invented: UpdateCartAddressInput = { shippingAddress: { additionalFields: { "future/field": true } } }
		// @ts-expect-error projecting an empty billing registry must not invent writable fields
		const inventedBilling: UpdateCartAddressInput = { billingAddress: { additionalFields: { "future/field": true } } }
		export { empty, update, checkout, dynamic, invented, inventedBilling }`,
		)
		expect(compile(dir)).toEqual([])
	} finally {
		fs.rmSync(dir, { force: true, recursive: true })
	}
}, 30_000)

const BILLING_FIELDS_USAGE = `import { type Cart, type CartBillingAddressInput, CartBillingAddressSubmission, type UpdateCartAddressInput, type ConfirmCheckoutInput, type RetryCheckoutInput, type CheckoutBillingAddressInput, type CheckoutShippingAddressInput } from "@kizlo/woocommerce"
	import type { WP_Schema } from "kizlo"
	import "./introspection"

	type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
	type Assert<T extends true> = T
	type ConfirmFields = ConfirmCheckoutInput["billingAddress"]["additionalFields"]
	type RetryFields = RetryCheckoutInput["billingAddress"]["additionalFields"]
	type ConfirmAlias = Assert<Equal<ConfirmFields, ConfirmCheckoutInput["billingAddress"]["additionalFields"]>>
	type RetryAlias = Assert<Equal<RetryFields, RetryCheckoutInput["billingAddress"]["additionalFields"]>>
	type AddressAlias = Assert<Equal<ConfirmFields, CartBillingAddressInput["additionalFields"]>>
	type SchemaInput = Assert<Equal<ConfirmFields, typeof CartBillingAddressSubmission["_input"]["additionalFields"]>>
	const partialBilling: CheckoutBillingAddressInput = { additionalFields: { "billing/choice": "home", "billing/flag": false } }
	const partialShipping: CheckoutShippingAddressInput = { city: "London", additionalFields: { "billing/choice": "office", "kizlo/tax-id": "excluded" } }
	const partialConfirm: ConfirmCheckoutInput = { billingAddress: partialBilling, shippingAddress: partialShipping, paymentMethod: "bacs" }
	const partialRetry: RetryCheckoutInput = { billingAddress: partialBilling, paymentMethod: "bacs", key: "key", orderId: 42 }
	const inferredConfirm: ConfirmCheckoutInput = partialConfirm
	const inferredRetry: RetryCheckoutInput = partialRetry
	// @ts-expect-error a partial core address still requires registered answers
	const missingAnswer: CheckoutBillingAddressInput = { additionalFields: {} }
	// @ts-expect-error a supplied shipping address retains registered requirements
	const missingShippingAnswer: CheckoutShippingAddressInput = { additionalFields: {} }
	// @ts-expect-error billing remains required on confirmation
	const missingBilling: ConfirmCheckoutInput = { paymentMethod: "bacs" }
	// @ts-expect-error billing remains required on retry
	const missingRetryBilling: RetryCheckoutInput = { paymentMethod: "bacs", key: "key", orderId: 42 }
	type RequiredChoice = Assert<Equal<ConfirmFields["billing/choice"], "home" | "office">>
	type OptionalFlag = Assert<Equal<ConfirmFields["billing/flag"], boolean | undefined>>
	type ReadChoice = Assert<Equal<Cart["billingAddress"]["additionalFields"]["billing/choice"], "" | "home" | "office" | undefined>>
	type ReadFlag = Assert<Equal<Cart["billingAddress"]["additionalFields"]["billing/flag"], boolean | undefined>>
	type RawTaxId = Assert<Equal<WP_Schema<"woocommerce.additional-fields.address.write">["kizlo/tax-id"], string>>
	type ProjectedTaxId = Assert<Equal<ConfirmFields["kizlo/tax-id"], undefined>>
	type NativeTaxId = Assert<Equal<Cart["billingAddress"]["taxId"], string>>

	const confirmation: ConfirmFields = { "billing/choice": "home", "billing/flag": false }
	const retry: RetryFields = { "billing/choice": "office" }
	const partial: UpdateCartAddressInput = { billingAddress: { additionalFields: {} } }
	const partialFlag: UpdateCartAddressInput = { billingAddress: { taxId: "", additionalFields: { "billing/flag": false } } }
	// @ts-expect-error confirmation must retain the registered required answer
	const missingConfirm: ConfirmFields = {}
	// @ts-expect-error retry must retain the registered required answer
	const missingRetry: RetryFields = {}
	// @ts-expect-error confirmation must retain the registered enum
	const invalidConfirm: ConfirmFields = { "billing/choice": "warehouse" }
	// @ts-expect-error retry must retain the registered enum
	const invalidRetry: RetryFields = { "billing/choice": "warehouse" }
	// @ts-expect-error a required select excludes the editable empty placeholder
	const placeholder: ConfirmFields = { "billing/choice": "" }
	// @ts-expect-error named checkbox types survive an open scalar index
	const invalidFlag: ConfirmFields = { "billing/choice": "home", "billing/flag": "false" }
	// @ts-expect-error partial updates retain named enum types
	const invalidPartial: UpdateCartAddressInput = { billingAddress: { additionalFields: { "billing/choice": "warehouse" } } }
	// @ts-expect-error partial updates retain named checkbox types
	const invalidPartialFlag: UpdateCartAddressInput = { billingAddress: { additionalFields: { "billing/flag": "false" } } }
	// @ts-expect-error raw Tax ID remains forbidden alongside valid required answers
	const duplicate: ConfirmFields = { "billing/choice": "home", "kizlo/tax-id": "GB" }
	// @ts-expect-error retry keeps the same native-only projection
	const duplicateRetry: RetryFields = { "billing/choice": "office", "kizlo/tax-id": "GB" }
	// @ts-expect-error partial updates also reject a raw projected key
	const duplicatePartial: UpdateCartAddressInput = { billingAddress: { additionalFields: { "kizlo/tax-id": "GB" } } }

	type ShippingFields = NonNullable<ConfirmCheckoutInput["shippingAddress"]>["additionalFields"]
	type ShippingChoice = Assert<Equal<ShippingFields["billing/choice"], "home" | "office">>
	type CheckoutFlag = Assert<Equal<NonNullable<ConfirmCheckoutInput["additionalFields"]>["billing/opt-in"], boolean | undefined>>
	declare const cart: Cart
	const unknownRead: string | boolean | undefined = cart.billingAddress.additionalFields["future/field"]
`

test.each(["closed", "indexed"] as const)(
	"published billing declarations preserve %s registered field contracts",
	(registration) => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-billing-fields-consumer-"))
		try {
			const document = introspection("billing")
			for (const mode of ["read", "write"] as const) {
				document.schemas[`woocommerce.additional-fields.address.${mode}`] = {
					type: "object",
					properties: {
						"billing/choice": {
							type: "string",
							enum: mode === "write" ? ["home", "office"] : ["", "home", "office"],
							required: mode === "write",
						},
						"billing/flag": { type: "boolean" },
						"kizlo/tax-id": { type: "string", required: mode === "write" },
					},
					additionalProperties: registration === "indexed" ? { anyOf: [{ type: "string" }, { type: "boolean" }] } : false,
				}
			}
			fs.writeFileSync(path.join(dir, "introspection.ts"), generateWordPressClient(document))
			fs.writeFileSync(path.join(dir, "usage.ts"), BILLING_FIELDS_USAGE)
			expect(compile(dir)).toEqual([])
		} finally {
			fs.rmSync(dir, { force: true, recursive: true })
		}
	},
	30_000,
)

test("published declarations expose trusted client IP configuration", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-client-ip-consumer-"))
	try {
		fs.writeFileSync(
			path.join(dir, "usage.ts"),
			`
			import { createGeoAdapter, geoCloudflareNext, geoVercelNext, WordPressTransport } from "kizlo/server"
			import { toNextJsHandler } from "kizlo/nextjs/server"
			import { createCdnHeaders, geoCloudflare, revalidateTag, revalidateUrl, withCloudflare, revalidator } from "kizlo/tanstack-start/cloudflare"
			import * as cloudflareApi from "kizlo/tanstack-start/cloudflare"
			import { matchMiddleware } from "kizlo/tanstack-start/react/server"
			import { createMiddleware, createStart } from "@tanstack/react-start"
			const { GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD } = toNextJsHandler(async (_request: Request) => new Response(null))
            const nextRoute: (request: Request, route: { params: Promise<{ rest: string[] }> }) => Response | Promise<Response> = GET
            // @ts-expect-error the adapter requires a Request/Response handler
            toNextJsHandler(async (_request: Request) => "invalid")
			const startWorker = withCloudflare({
                fetch(_request: Request, options: { context: { env: { SITE: string }; executionCtx: { waitUntil(p: Promise<unknown>): void } } }) {
                    return new Response(options.context.env.SITE)
                },
            })
            startWorker.fetch(new Request("https://app.example"), { SITE: "store" }, { waitUntil: () => {} })
            // @ts-expect-error preserve the Start worker binding types
            startWorker.fetch(new Request("https://app.example"), { SITE: 1 }, { waitUntil: () => {} })
			revalidator({
                postTypes: { guide: { resourceTag: (id) => "guide:" + id, collectionTags: (data) => (data.affected_terms.topic ?? []).map((id) => "topic:" + id) } },
                taxonomies: { topic: { resourceTag: (id) => "topic:" + id, collectionTags: (id, data) => ["topic:" + id + ":" + data.taxonomy] } },
                settings: {
                    "settings.taxonomy.updated": (event) => [event.data.key],
                    "settings.brand.updated": (event) => {
                        const value: null = event.data
                        return ["brand"]
                    },
                },
            })
            // @ts-expect-error callback tag results must be strings
            revalidator({ postTypes: { product: { resourceTag: () => 4 } } })
            // @ts-expect-error revalidation is synchronous selection before provider effects
            revalidator({ postTypes: { product: { resourceTag: async () => "tag" } } })
            // @ts-expect-error removed provider import has no deprecated alias
            import type * as oldProvider from "kizlo/tanstack-start/react/cloudflare"
            const publicHeaders: Record<string, string> = createCdnHeaders({ maxAge: 60, tags: ["catalog"] })
			const middleware = createMiddleware().server(({ next }) => next({ context: { userId: "alice" } }))
			const selected = matchMiddleware(middleware, ["/account(.*)", "/_serverFn/(.*)"])
			const start = createStart(() => ({ requestMiddleware: [selected] }))
			// @ts-expect-error middleware matching uses path patterns rather than include/exclude objects
			matchMiddleware(middleware, { exclude: ["/"] })
			const policy: Record<string, string> = createCdnHeaders({ maxAge: "1 hour", tags: ["catalog"], vary: ["Accept-Language"] as const })
			const urlRevalidation: Promise<void> = revalidateUrl("/collections")
			revalidateUrl(new URL("https://app.example/collections?page=2"))
			const tagRevalidation: Promise<void> = revalidateTag("catalog")
			// @ts-expect-error tags are revalidated by name, not a selector object
			revalidateTag({ tags: ["catalog"] })
			// @ts-expect-error Vary accepts header names as an array
			createCdnHeaders({ maxAge: 60, vary: "Accept" })
			// @ts-expect-error the CDN namespace has been removed
			cloudflareApi.cdn
			// @ts-expect-error use createCdnHeaders
			cloudflareApi.cdnHeaders
			// @ts-expect-error use withCloudflare
			cloudflareApi.withTanstackStart
			// @ts-expect-error the old selector type has been removed
			type LegacyTargets = cloudflareApi.CdnTargets
			// @ts-expect-error duration strings use explicit units
			createCdnHeaders({ maxAge: "forever" })
			geoCloudflare().getConnInfo(null)

			new WordPressTransport({ credentials: { url: "https://wp.example", username: "admin", password: "secret" }, getClientIp: () => "2001:db8::1" })
			// @ts-expect-error geo adapters return connection info rather than just an IP
			createGeoAdapter({ getConnInfo: () => "203.0.113.1" })
		`,
		)
		expect(compile(dir, ["usage.ts"])).toEqual([])
	} finally {
		fs.rmSync(dir, { force: true, recursive: true })
	}
})

test("published browser entry imports without Node or framework dependencies", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-browser-import-"))
	try {
		const loader = path.join(dir, "loader.mjs")
		fs.writeFileSync(
			loader,
			`export async function resolve(name, context, next) {
   if (name.startsWith("node:") || ["react", "next", "@tanstack/"].some(prefix => name.startsWith(prefix))) throw Error("Server dependency: " + name)
   return next(name, context)
  }`,
		)
		const entry = new URL("../../dist/index.js", import.meta.url).href
		const browser = new URL("../../dist/browser.js", import.meta.url).href
		const program = `import { createBrowserClient } from ${JSON.stringify(entry)};
   import { createBrowserClient as direct } from ${JSON.stringify(browser)};
   if (typeof createBrowserClient !== "function" || typeof direct !== "function") throw Error("Missing browser client");
   console.log("browser import passed");`
		expect(
			execFileSync(process.execPath, ["--no-warnings", "--experimental-loader", loader, "--input-type=module", "-e", program], {
				encoding: "utf8",
			}),
		).toContain("browser import passed")
	} finally {
		fs.rmSync(dir, { recursive: true, force: true })
	}
})

test("published shared Start entry points do not require React in a Solid-only consumer", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-start-without-react-"))
	try {
		const loader = path.join(dir, "loader.mjs")
		fs.writeFileSync(
			loader,
			`export async function resolve(name, context, next) {
			if (name === "react" || name.startsWith("react/") || name.startsWith("react-dom") || name.startsWith("@tanstack/react-")) throw Error("React unavailable: " + name);
			return next(name, context);
		}`,
		)
		const shared = new URL("../../dist/tanstack-start.js", import.meta.url).href
		const server = new URL("../../dist/tanstack-start/server.js", import.meta.url).href
		const provider = new URL("../../dist/tanstack-start/cloudflare.js", import.meta.url).href
		const program = `import { createKizloClient, resolvePageHead } from ${JSON.stringify(shared)};
			import { resolveRootHead } from ${JSON.stringify(server)};
            import { createCdnHeaders, revalidator } from ${JSON.stringify(provider)};
            if (createCdnHeaders({ maxAge: 60 })["Cache-Control"] !== "no-cache" || typeof revalidator().handler !== "function") throw Error("Neutral provider failed");
			if ([createKizloClient, resolvePageHead, resolveRootHead].some(value => typeof value !== "function")) throw Error("Missing shared helpers");
			console.log("framework-neutral Start passed");`
		expect(
			execFileSync(process.execPath, ["--no-warnings", "--experimental-loader", loader, "--input-type=module", "-e", program], {
				encoding: "utf8",
			}),
		).toContain("framework-neutral Start passed")
	} finally {
		fs.rmSync(dir, { recursive: true, force: true })
	}
})

test("published React Start entries load with the supported native runtime", () => {
	const server = new URL("../../dist/tanstack-start/react/server.js", import.meta.url).href
	const cloudflare = new URL("../../dist/tanstack-start/cloudflare.js", import.meta.url).href
	const program = `import { matchMiddleware } from ${JSON.stringify(server)};
		import { createCdnHeaders, revalidateUrl, revalidateTag, withCloudflare } from ${JSON.stringify(cloudflare)};
		if ([matchMiddleware, createCdnHeaders, revalidateUrl, revalidateTag, withCloudflare].some(value => typeof value !== "function")) throw Error("Missing React helpers");
		console.log("native React Start passed");`
	expect(execFileSync(process.execPath, ["--input-type=module", "-e", program], { encoding: "utf8" })).toContain(
		"native React Start passed",
	)
})

test("published browser declarations expose only the explicit browser projection", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-direct-browser-consumer-"))
	try {
		const document = introspection("browser")
		const operation = document.apis["kizlo.post-types.post"]?.paths["/post-types/post/{identifier}"]?.retrieve
		if (!operation) throw Error("Missing test operation")
		operation.access = "public"
		document.apis["admin.secrets"] = {
			namespace: "kizlo/v1",
			paths: { "/private-secrets": { retrieve: { ...operation, access: "admin" } } },
		}
		fs.writeFileSync(path.join(dir, "introspection.ts"), generateWordPressModule(document, { audience: "browser" }).source)
		fs.writeFileSync(
			path.join(dir, "usage.ts"),
			`
   import { createBrowserClient } from "kizlo/browser"
   import type { ActiveKizloClient } from "kizlo"
   import { introspection } from "./introspection"
   const client = createBrowserClient({ url: "https://wp.example", endpoints: introspection })
   const registered: ActiveKizloClient = client
   registered.kizlo.postTypes.post.retrieve({ params: { identifier: "hello" } })
   // @ts-expect-error the projection never exposes admin operations
   client.admin
   // @ts-expect-error browser options never accept service credentials
   createBrowserClient({ url: "https://wp.example", endpoints: introspection, credentials: { username: "admin", password: "secret" } })
  `,
		)
		expect(compile(dir)).toEqual([])
	} finally {
		fs.rmSync(dir, { recursive: true, force: true })
	}
})

test("missing generation cannot silently make browser hooks or endpoint data any", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-missing-contract-consumer-"))
	try {
		fs.writeFileSync(
			path.join(dir, "usage.ts"),
			`
   import type { ActiveKizloClient, WP_EndpointData } from "kizlo"
   declare const client: ActiveKizloClient
   // @ts-expect-error generation is required before a hook has callable endpoints
   client.future.anything()
   type IsAny<T> = 0 extends 1 & T ? true : false
   const exact: IsAny<WP_EndpointData<"future.anything">> = false
  `,
		)
		expect(compile(dir, ["usage.ts"])).toEqual([])
	} finally {
		fs.rmSync(dir, { recursive: true, force: true })
	}
})
