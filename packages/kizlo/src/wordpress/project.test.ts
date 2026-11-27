import { expect, test } from "vitest"
import { generateWordPressModule } from "./generate"
import type { IntrospectionDocument, IntrospectionOperation } from "./introspection"
import { projectBrowserIntrospection } from "./project"

function operation(access?: IntrospectionOperation["access"], schema = "store.public"): IntrospectionOperation {
	return { method: "GET", ...(access ? { access } : {}), errors: [], input: {}, responses: { "200": { body: { $ref: schema } } } }
}

function document(): IntrospectionDocument {
	return {
		version: "1.1",
		hash: `sha256:${"0".repeat(64)}`,
		diagnostics: [],
		schemas: {
			"store.public": {
				type: "object",
				properties: { image: { $ref: "store.image" }, customer: { anyOf: [{ $ref: "store.customer" }, { type: "string" }] } },
			},
			"store.image": { type: "string" },
			"store.customer": { type: "object", $extends: "store.base", properties: { related: { $ref: "store.customer" } } },
			"store.base": { type: "object", properties: { id: { type: "integer" } } },
			"store.admin": { type: "object", properties: { secret: { type: "string" } } },
		},
		apis: {
			"store.products": {
				namespace: "kizlo/v1",
				paths: { "/products": { list: operation("public"), update: { ...operation("admin", "store.admin"), method: "POST" } } },
			},
			"store.account": { namespace: "kizlo/v1", paths: { "/account": { retrieve: operation("authenticated") } } },
			"store.unknown": { namespace: "kizlo/v1", paths: { "/unknown": { retrieve: operation() } } },
		},
	}
}

test("browser projection excludes privileged and unclassified operations and their exclusive schemas", () => {
	const source = document()
	const browser = projectBrowserIntrospection(source)
	expect(browser.apis["store.products"]?.paths["/products"]).toHaveProperty("list")
	expect(browser.apis["store.products"]?.paths["/products"]).not.toHaveProperty("update")
	expect(browser.apis).toHaveProperty("store.account")
	expect(browser.apis).not.toHaveProperty("store.unknown")
	expect(browser.schemas).not.toHaveProperty("store.admin")
	expect(source.apis["store.products"]?.paths["/products"]).toHaveProperty("update")
})

test("referenced schemas include nested unions, inheritance, and cycles without retaining everything", () => {
	expect(Object.keys(projectBrowserIntrospection(document()).schemas).sort()).toEqual([
		"store.base",
		"store.customer",
		"store.image",
		"store.public",
	])
})

test("a missing reachable schema is a generation error", () => {
	const source = document()
	delete source.schemas["store.image"]
	expect(() => projectBrowserIntrospection(source)).toThrow("store.image")
})

test("browser output imports only the browser entry and does not augment the server registry", () => {
	const generated = generateWordPressModule(document(), { audience: "browser" }).source
	expect(generated).toContain('from "kizlo/browser"')
	expect(generated).not.toContain('from "kizlo"')
	expect(generated).not.toContain("WordPressClientRegistry")
	expect(generated).not.toContain("StoreAdmin")
	expect(generated).not.toContain('"/unknown"')
	expect(generateWordPressModule(document()).source).toContain("WordPressClientRegistry")
})
