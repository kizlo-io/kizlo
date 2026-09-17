import { describe, expect, it } from "vitest"
import type { IntrospectionDocument } from "../../wordpress/introspection"
import { INTROSPECTION_FIXTURE } from "../../wordpress/introspection.fixture"
import { toJsonSchema } from "./schema"

const document = INTROSPECTION_FIXTURE

function convert(id: string): Record<string, unknown> {
	const schema = document.schemas[id]
	if (!schema) throw new Error(`The fixture has no schema "${id}".`)
	return toJsonSchema(schema, document)
}

describe("toJsonSchema", () => {
	it("moves per-property `required` onto the object holding them", () => {
		const result = convert("kizlo.error")

		expect(result.required).toEqual(["code", "message"])
		// The flag describes membership, so it must not survive on the property itself.
		expect((result.properties as Record<string, unknown>).code).toEqual({ type: "string" })
	})

	it("omits `required` entirely when no property is required", () => {
		expect(convert("acme.dictionary")).not.toHaveProperty("required")
	})

	it("resolves `$extends` against document.schemas", () => {
		const result = convert("acme.book")
		const properties = result.properties as Record<string, unknown>

		// `id` and `label` are acme.entity's; the rest are the book's own.
		expect(Object.keys(properties).sort()).toEqual(["author", "id", "label", "metadata", "publication", "status", "tags"])
		expect(result.required).toEqual(expect.arrayContaining(["id", "status"]))
	})

	it("resolves every id in an array `$extends`", () => {
		const result = convert("acme.maybe-book")
		const properties = result.properties as Record<string, unknown>

		// acme.book's own, acme.entity's through it, acme.audit's, and the schema's own attachment.
		expect(Object.keys(properties)).toEqual(expect.arrayContaining(["status", "id", "created_by", "attachment"]))
		expect(result.required).toEqual(expect.arrayContaining(["created_by", "id", "status"]))
	})

	it("resolves `$ref` and inlines what it names", () => {
		const result = convert("acme.choice")
		const [book, text] = result.oneOf as Record<string, unknown>[]

		expect(book).not.toHaveProperty("$ref")
		expect(Object.keys(book?.properties as Record<string, unknown>)).toContain("status")
		expect(text?.type).toEqual(["string", "null"])
	})

	it("maps `file` onto the string/binary pair", () => {
		const properties = convert("acme.maybe-book").properties as Record<string, unknown>

		expect(properties.attachment).toEqual({ type: "string", format: "binary" })
	})

	it("converts a nested object's properties and an array's items", () => {
		const properties = convert("acme.book").properties as Record<string, unknown>

		expect(properties.tags).toEqual({ type: "array", items: { type: "string" } })

		const publication = properties.publication as Record<string, unknown>
		const imprint = (publication.properties as Record<string, unknown>).imprint as Record<string, unknown>
		expect(imprint.type).toBe("object")
		expect(imprint.required).toEqual(["name"])
		expect((imprint.properties as Record<string, unknown>).name).toEqual({ type: "string" })
	})

	it("keeps required nesting intact through several levels", () => {
		const result = convert("post-types.book.item")
		const kizlo = (result.properties as Record<string, unknown>).kizlo as Record<string, unknown>
		const custom = (kizlo.properties as Record<string, unknown>).custom as Record<string, unknown>

		expect(result.required).toEqual(["kizlo"])
		expect(kizlo.required).toEqual(["custom"])
		expect(custom.required).toEqual(["isbn"])
	})

	it("widens a nullable type rather than carrying the keyword across", () => {
		const properties = convert("acme.entity").properties as Record<string, unknown>

		expect(properties.label).toEqual({ type: ["string", "null"], description: "Display label." })
	})

	it("widens a nullable $ref to the type it resolves to", () => {
		const extended: IntrospectionDocument = {
			...document,
			schemas: { ...document.schemas, "acme.maybe-entity": { $ref: "acme.entity", nullable: true } },
		}
		const result = toJsonSchema(extended.schemas["acme.maybe-entity"] as never, extended)

		// The reference resolves to an object, and that is the type that has to accept null.
		expect(result.type).toEqual(["object", "null"])
		expect(Object.keys(result.properties as Record<string, unknown>)).toEqual(["id", "label"])
	})

	it("unions a nullable combinator, which has no type of its own to widen", () => {
		const extended: IntrospectionDocument = {
			...document,
			schemas: { ...document.schemas, "acme.maybe-choice": { oneOf: [{ type: "string" }, { type: "integer" }], nullable: true } },
		}
		const result = toJsonSchema(extended.schemas["acme.maybe-choice"] as never, extended)

		expect(result.anyOf).toEqual([{ oneOf: [{ type: "string" }, { type: "integer" }] }, { type: "null" }])
	})

	it("carries enum, description, deprecated, and the two open-ended object keywords", () => {
		const book = convert("acme.book").properties as Record<string, unknown>
		expect((book.status as Record<string, unknown>).enum).toEqual(["draft", "publish"])
		expect((book.metadata as Record<string, unknown>).additionalProperties).toEqual({
			anyOf: [{ type: "string" }, { type: "number" }],
		})

		const dictionary = convert("acme.dictionary")
		expect((dictionary.properties as Record<string, unknown>).known).toEqual({ type: "boolean", deprecated: true })
		expect(dictionary.patternProperties).toEqual({ "^count_": { type: "integer" } })
		expect(dictionary.additionalProperties).toEqual({ type: "number" })
	})

	it("lets a schema override a property it inherits", () => {
		const extended: IntrospectionDocument = {
			...document,
			schemas: {
				...document.schemas,
				"acme.override": { type: "object", $extends: "acme.entity", properties: { label: { type: "integer", required: true } } },
			},
		}
		const result = toJsonSchema(extended.schemas["acme.override"] as never, extended)

		expect((result.properties as Record<string, unknown>).label).toEqual({ type: "integer" })
		expect(result.required).toEqual(expect.arrayContaining(["id", "label"]))
	})

	it("stops at a schema that reaches itself instead of recursing forever", () => {
		const cyclic: IntrospectionDocument = {
			...document,
			schemas: {
				"acme.node": { type: "object", properties: { child: { $ref: "acme.node" }, name: { type: "string", required: true } } },
			},
		}
		const result = toJsonSchema(cyclic.schemas["acme.node"] as never, cyclic)
		const child = (result.properties as Record<string, unknown>).child as Record<string, unknown>

		expect(result.required).toEqual(["name"])
		// The reference is followed once and then stops: the id is only marked seen as it is resolved,
		// so the first hop expands and the one inside it closes the loop.
		expect(child.required).toEqual(["name"])
		expect((child.properties as Record<string, unknown>).child).toEqual({})
	})

	it("returns an empty schema for a reference the document does not define", () => {
		const dangling: IntrospectionDocument = { ...document, schemas: { "acme.dangling": { $ref: "acme.absent" } } }

		expect(toJsonSchema(dangling.schemas["acme.dangling"] as never, dangling)).toEqual({})
	})
})
