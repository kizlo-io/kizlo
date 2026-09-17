import type { IntrospectionDocument, IntrospectionSchema } from "../../wordpress/introspection"

export type JsonSchema = Record<string, unknown>

/**
 * Turn an introspection schema into the JSON Schema an MCP client validates a tool call against.
 *
 * Three things separate the two dialects. Introspection marks a field required on the field itself,
 * where JSON Schema lists the names on the object holding them. `$ref` and `$extends` name entries in
 * `document.schemas` rather than being JSON pointers, and a client that has only the tool's schema
 * cannot follow either, so both are resolved and inlined here. And `file` is not a JSON Schema type;
 * it becomes the `string`/`binary` pair OpenAPI uses for the same thing.
 */
export function toJsonSchema(schema: IntrospectionSchema, document: IntrospectionDocument): JsonSchema {
	return convert(schema, document, new Set())
}

/**
 * A schema is its own keywords laid over whatever it references. `$ref` names the whole shape and
 * `$extends` names shapes to build on, so both resolve to bases and the schema's own keywords win —
 * which is what lets `acme.book` extend `acme.entity` and still redeclare a property it inherits.
 *
 * `seen` carries the ids already being resolved on this branch. A contract is free to describe a
 * schema that reaches itself, and without this that is an infinite recursion rather than a document.
 */
function convert(schema: IntrospectionSchema, document: IntrospectionDocument, seen: ReadonlySet<string>): JsonSchema {
	let result = own(schema, document, seen)
	for (const id of [...(schema.$ref ? [schema.$ref] : []), ...names(schema.$extends)]) {
		result = merge(reference(id, document, seen), result)
	}
	// After the references, because the type a `$ref` resolves to is the one that has to accept null.
	return schema.nullable ? widenToNull(result) : result
}

/**
 * Let a converted schema accept `null`. A type takes it in place; a schema whose shape came from a
 * `$ref` or a combinator has no type of its own to widen, so the union carries it instead.
 */
function widenToNull(schema: JsonSchema): JsonSchema {
	const type = schema.type
	if (typeof type === "string") return { ...schema, type: [type, "null"] }
	if (Array.isArray(type)) return type.includes("null") ? schema : { ...schema, type: [...type, "null"] }
	return { anyOf: [schema, { type: "null" }] }
}

/** Resolve one `document.schemas` entry, or an empty schema when it is absent or already on this branch. */
function reference(id: string, document: IntrospectionDocument, seen: ReadonlySet<string>): JsonSchema {
	const target = document.schemas[id]
	if (!target || seen.has(id)) return {}
	return convert(target, document, new Set([...seen, id]))
}

function names(value: string | string[] | undefined): string[] {
	if (value === undefined) return []
	return Array.isArray(value) ? value : [value]
}

/**
 * Lay `own` over `base`. Only the two keywords that describe an object's members combine: everything
 * else is a plain override, since a schema restating a `type` or a `description` means to replace it.
 */
function merge(base: JsonSchema, own: JsonSchema): JsonSchema {
	const result: JsonSchema = { ...base, ...own }

	const properties = { ...(base.properties as JsonSchema | undefined), ...(own.properties as JsonSchema | undefined) }
	if (Object.keys(properties).length > 0) result.properties = properties

	const required = [...new Set([...((base.required as string[]) ?? []), ...((own.required as string[]) ?? [])])]
	if (required.length > 0) result.required = required

	return result
}

/** The schema's own keywords, with the references it is built from left to {@link convert}. */
function own(schema: IntrospectionSchema, document: IntrospectionDocument, seen: ReadonlySet<string>): JsonSchema {
	const result: JsonSchema = {}

	// `file` has no JSON Schema type of its own. `nullable` is not handled here: it applies to whatever
	// this schema finally resolves to, which {@link convert} only knows once its references are in.
	if (schema.type === "file") {
		result.type = "string"
		result.format = "binary"
	} else if (schema.type) {
		result.type = schema.type
	}

	if (schema.title !== undefined) result.title = schema.title
	if (schema.description !== undefined) result.description = schema.description
	if (schema.deprecated !== undefined) result.deprecated = schema.deprecated
	if (schema.default !== undefined) result.default = schema.default
	if (schema.enum !== undefined) result.enum = schema.enum
	if (schema.format !== undefined) result.format = schema.format

	if (schema.properties) {
		const properties: JsonSchema = {}
		const required: string[] = []
		for (const [name, child] of Object.entries(schema.properties)) {
			properties[name] = convert(child, document, seen)
			// The child says it is required; the object holding it is where JSON Schema records that.
			if (child.required) required.push(name)
		}
		result.properties = properties
		if (required.length > 0) result.required = required
	}

	if (schema.items) result.items = convert(schema.items, document, seen)
	if (schema.anyOf) result.anyOf = schema.anyOf.map((member) => convert(member, document, seen))
	if (schema.oneOf) result.oneOf = schema.oneOf.map((member) => convert(member, document, seen))

	if (typeof schema.additionalProperties === "boolean") result.additionalProperties = schema.additionalProperties
	else if (schema.additionalProperties) result.additionalProperties = convert(schema.additionalProperties, document, seen)

	if (schema.patternProperties) {
		result.patternProperties = Object.fromEntries(
			Object.entries(schema.patternProperties).map(([pattern, child]) => [pattern, convert(child, document, seen)]),
		)
	}

	return result
}
