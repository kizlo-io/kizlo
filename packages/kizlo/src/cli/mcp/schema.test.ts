import { describe, expect, it } from "vitest"
import type { IntrospectionDocument } from "../../wordpress/introspection"
import { INTROSPECTION_FIXTURE } from "../../wordpress/introspection.fixture"
import { inputJsonSchema, toJsonSchema } from "./schema"

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

	it("points a `$ref` at a definition rather than copying what it names", () => {
		const result = convert("acme.choice")
		const [book, text] = result.oneOf as Record<string, unknown>[]
		const defs = result.$defs as Record<string, Record<string, unknown>>

		expect(book).toEqual({ $ref: "#/$defs/acme.book" })
		// The definition is the whole shape, `$extends` bases flattened into it as before.
		expect(Object.keys(defs["acme.book"]?.properties as Record<string, unknown>)).toContain("status")
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

	it("unions a nullable `$ref`, which carries a pointer and no type to widen", () => {
		const extended: IntrospectionDocument = {
			...document,
			schemas: { ...document.schemas, "acme.maybe-entity": { $ref: "acme.entity", nullable: true } },
		}
		const result = toJsonSchema(extended.schemas["acme.maybe-entity"] as never, extended)
		const defs = result.$defs as Record<string, Record<string, unknown>>

		expect(result.anyOf).toEqual([{ $ref: "#/$defs/acme.entity" }, { type: "null" }])
		expect(Object.keys(defs["acme.entity"]?.properties as Record<string, unknown>)).toEqual(["id", "label"])
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

	it("describes a schema that reaches itself as one definition pointing at itself", () => {
		const cyclic: IntrospectionDocument = {
			...document,
			schemas: {
				"acme.node": { type: "object", properties: { child: { $ref: "acme.node" }, name: { type: "string", required: true } } },
			},
		}
		const result = toJsonSchema(cyclic.schemas["acme.node"] as never, cyclic)
		const node = (result.$defs as Record<string, Record<string, unknown>>)["acme.node"] as Record<string, unknown>

		expect(result.required).toEqual(["name"])
		// A pointer at every depth, so the child contract stays complete however far it nests rather
		// than bottoming out in an empty schema.
		expect((result.properties as Record<string, unknown>).child).toEqual({ $ref: "#/$defs/acme.node" })
		expect(node.required).toEqual(["name"])
		expect((node.properties as Record<string, unknown>).child).toEqual({ $ref: "#/$defs/acme.node" })
	})

	it("describes mutually recursive definitions without inlining either", () => {
		const mutual: IntrospectionDocument = {
			...document,
			schemas: {
				"acme.parent": { type: "object", properties: { child: { $ref: "acme.child" } } },
				"acme.child": { type: "object", properties: { parent: { $ref: "acme.parent" } } },
			},
		}
		const result = toJsonSchema(mutual.schemas["acme.parent"] as never, mutual)
		const defs = result.$defs as Record<string, Record<string, unknown>>
		const child = defs["acme.child"] as Record<string, unknown>
		const parent = defs["acme.parent"] as Record<string, unknown>

		expect((result.properties as Record<string, unknown>).child).toEqual({ $ref: "#/$defs/acme.child" })
		expect((child.properties as Record<string, unknown>).parent).toEqual({ $ref: "#/$defs/acme.parent" })
		expect((parent.properties as Record<string, unknown>).child).toEqual({ $ref: "#/$defs/acme.child" })
	})

	it("keeps a recursive child contract complete at every nesting depth", () => {
		const nested: IntrospectionDocument = {
			...document,
			schemas: {
				"kizlo.custom-field": {
					type: "object",
					properties: {
						name: { type: "string", required: true },
						fields: { type: "array", items: { $ref: "kizlo.custom-field" } },
					},
				},
			},
		}
		const result = toJsonSchema(nested.schemas["kizlo.custom-field"] as never, nested)
		const defs = result.$defs as Record<string, Record<string, unknown>>
		const field = defs["kizlo.custom-field"] as Record<string, unknown>
		const fields = (field.properties as Record<string, Record<string, unknown>>).fields as Record<string, unknown>

		// The group and repeater case: the items pointer resolves back to a definition that still
		// declares `name`, where inlining used to hand back `{}` below the first level.
		expect(fields.items).toEqual({ $ref: "#/$defs/kizlo.custom-field" })
		expect(field.required).toEqual(["name"])
	})

	it("forwards every validation keyword the contract publishes", () => {
		const bounded: IntrospectionDocument = {
			...document,
			schemas: {
				"acme.bounded": {
					type: "object",
					properties: {
						when: { type: "string", format: "date", pattern: "^\\d{4}-\\d{2}-\\d{2}$", minLength: 10, maxLength: 10 },
						count: { type: "number", minimum: 1, maximum: 9, multipleOf: 0.5, exclusiveMinimum: true, exclusiveMaximum: false },
						rows: { type: "array", minItems: 1, maxItems: 20, uniqueItems: true, items: { type: "string" } },
						meta: { type: "object", minProperties: 1, maxProperties: 4 },
					},
				},
			},
		}
		const converted = toJsonSchema(bounded.schemas["acme.bounded"] as never, bounded)
		const properties = converted.properties as Record<string, Record<string, unknown>>

		expect(properties.when).toMatchObject({ pattern: "^\\d{4}-\\d{2}-\\d{2}$", minLength: 10, maxLength: 10, format: "date" })
		expect(properties.count).toMatchObject({ minimum: 1, maximum: 9, multipleOf: 0.5, exclusiveMinimum: true, exclusiveMaximum: false })
		expect(properties.rows).toMatchObject({ minItems: 1, maxItems: 20, uniqueItems: true })
		expect(properties.meta).toMatchObject({ minProperties: 1, maxProperties: 4 })
	})

	it("leaves a reference the document does not define inlined, with nothing to point at", () => {
		const dangling: IntrospectionDocument = { ...document, schemas: { "acme.dangling": { $ref: "acme.absent" } } }
		const result = toJsonSchema(dangling.schemas["acme.dangling"] as never, dangling)

		expect(result).toEqual({})
		expect(result).not.toHaveProperty("$defs")
	})
})

describe("inputJsonSchema", () => {
	it("emits a definition two request parts reach once, at the composed root", () => {
		const shared: IntrospectionDocument = {
			...document,
			schemas: { ...document.schemas, "acme.filter": { type: "object", properties: { term: { type: "string" } } } },
		}
		const result = inputJsonSchema(
			{
				query: { type: "object", properties: { filter: { $ref: "acme.filter" } } },
				body: { type: "object", properties: { filter: { $ref: "acme.filter" } } },
			},
			shared,
		)
		const properties = result.properties as Record<string, Record<string, unknown>>
		const query = properties.query as Record<string, unknown>
		const body = properties.body as Record<string, unknown>

		expect((query.properties as Record<string, unknown>).filter).toEqual({ $ref: "#/$defs/acme.filter" })
		expect((body.properties as Record<string, unknown>).filter).toEqual({ $ref: "#/$defs/acme.filter" })
		expect(Object.keys(result.$defs as Record<string, unknown>)).toEqual(["acme.filter"])
	})

	it("demands a part whose requirements arrive through a reference", () => {
		const referenced: IntrospectionDocument = {
			...document,
			schemas: { ...document.schemas, "acme.identified": { type: "object", properties: { id: { type: "string", required: true } } } },
		}
		const result = inputJsonSchema({ params: { type: "object", $ref: "acme.identified" } }, referenced)

		// The part carries a pointer now, so its `required` list lives in `$defs` rather than on it.
		expect(result.required).toEqual(["params"])
	})
})
