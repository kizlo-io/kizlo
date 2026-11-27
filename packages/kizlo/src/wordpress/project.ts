import type { IntrospectionApi, IntrospectionDocument, IntrospectionSchema } from "./introspection"

/** Browser visibility is opt-in; authorization is still enforced by WordPress. */
export function projectBrowserIntrospection(document: IntrospectionDocument): IntrospectionDocument {
	const apis: Record<string, IntrospectionApi> = {}
	const needed = new Set<string>()
	const collect = (value: unknown): void => {
		if (!value || typeof value !== "object") return
		if (Array.isArray(value)) {
			for (const item of value) collect(item)
			return
		}
		for (const [key, child] of Object.entries(value)) {
			if (key === "$ref" && typeof child === "string") needed.add(child)
			else if (key === "$extends") {
				for (const id of Array.isArray(child) ? child : [child]) if (typeof id === "string") needed.add(id)
			} else collect(child)
		}
	}
	for (const [id, api] of Object.entries(document.apis)) {
		const paths: IntrospectionApi["paths"] = {}
		for (const [path, operations] of Object.entries(api.paths)) {
			for (const [name, operation] of Object.entries(operations)) {
				if (!operation.access || operation.access === "admin") continue
				const kept = paths[path] ?? {}
				kept[name] = operation
				paths[path] = kept
				collect(operation)
			}
		}
		if (Object.keys(paths).length) apis[id] = { namespace: api.namespace, paths }
	}
	const schemas: Record<string, IntrospectionSchema> = {}
	// Set iteration also visits references discovered while traversing their parent schemas.
	for (const id of needed) {
		const schema = document.schemas[id]
		if (!schema) throw new Error(`The browser contract references missing schema "${id}"`)
		schemas[id] = schema
		collect(schema)
	}
	return { ...document, apis, schemas }
}
