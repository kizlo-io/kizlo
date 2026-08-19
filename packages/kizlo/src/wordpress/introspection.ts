import z from "zod/v4"

export const WORDPRESS_INTROSPECTION_VERSION = "1.0"

export type IntrospectionRequestContentType = "application/json" | "multipart/form-data" | "application/x-www-form-urlencoded"
export type IntrospectionResponseContentType =
	| "application/json"
	| "text/plain"
	| "text/html"
	| "application/xml"
	| "text/csv"
	| "application/octet-stream"

export interface IntrospectionSchema {
	type?: "string" | "integer" | "number" | "boolean" | "object" | "array" | "file"
	title?: string
	description?: string
	deprecated?: boolean
	required?: boolean
	nullable?: boolean
	default?: unknown
	enum?: unknown[]
	format?: string
	properties?: Record<string, IntrospectionSchema>
	items?: IntrospectionSchema
	$ref?: string
	$extends?: string | string[]
	anyOf?: IntrospectionSchema[]
	oneOf?: IntrospectionSchema[]
	additionalProperties?: boolean | IntrospectionSchema
	patternProperties?: Record<string, IntrospectionSchema>
	in?: "path"
}

export interface IntrospectionResponse {
	description?: string
	content_type?: IntrospectionResponseContentType
	headers?: IntrospectionSchema
	body?: IntrospectionSchema
}

export interface IntrospectionOperation {
	method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS"
	summary?: string
	description?: string
	deprecated?: boolean
	errors: string[]
	input: IntrospectionSchema & { type: "object"; content_type?: IntrospectionRequestContentType }
	responses: Record<string, IntrospectionResponse>
}

export interface IntrospectionApi {
	namespace: string
	paths: Record<string, Record<string, IntrospectionOperation>>
}

export interface IntrospectionDiagnostic {
	type: "warning" | "error"
	message: string
	data: Record<string, string>
}

export interface IntrospectionDocument {
	version: typeof WORDPRESS_INTROSPECTION_VERSION
	hash: string
	schemas: Record<string, IntrospectionSchema>
	apis: Record<string, IntrospectionApi>
	diagnostics: IntrospectionDiagnostic[]
}

const schema: z.ZodType<IntrospectionSchema> = z.lazy(() =>
	z
		.object({
			type: z.enum(["string", "integer", "number", "boolean", "object", "array", "file"]).optional(),
			title: z.string().optional(),
			description: z.string().optional(),
			deprecated: z.boolean().optional(),
			required: z.boolean().optional(),
			nullable: z.boolean().optional(),
			default: z.unknown().optional(),
			enum: z.array(z.unknown()).optional(),
			format: z.string().optional(),
			properties: z.record(z.string(), schema).optional(),
			items: schema.optional(),
			$ref: z.string().min(1).optional(),
			$extends: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]).optional(),
			anyOf: z.array(schema).min(1).optional(),
			oneOf: z.array(schema).min(1).optional(),
			additionalProperties: z.union([z.boolean(), schema]).optional(),
			patternProperties: z.record(z.string(), schema).optional(),
			in: z.literal("path").optional(),
		})
		.loose(),
)

const response = z
	.object({
		description: z.string().optional(),
		content_type: z
			.enum(["application/json", "text/plain", "text/html", "application/xml", "text/csv", "application/octet-stream"])
			.optional(),
		headers: schema.optional(),
		body: schema.optional(),
	})
	.loose()

const operation: z.ZodType<IntrospectionOperation> = z
	.object({
		method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]),
		summary: z.string().optional(),
		description: z.string().optional(),
		deprecated: z.boolean().optional(),
		errors: z.array(z.string().min(1)),
		input: schema.and(
			z.object({
				type: z.literal("object"),
				content_type: z.enum(["application/json", "multipart/form-data", "application/x-www-form-urlencoded"]).optional(),
			}),
		),
		responses: z
			.record(z.string().regex(/^(?:[1-5][0-9]{2}|default)$/), response)
			.refine((value) => Object.keys(value).length > 0, "At least one response is required."),
	})
	.loose()

const api: z.ZodType<IntrospectionApi> = z.object({
	namespace: z.string().min(1),
	paths: z.record(z.string(), z.record(z.string(), operation)),
})

const diagnostic: z.ZodType<IntrospectionDiagnostic> = z.object({
	type: z.enum(["warning", "error"]),
	message: z.string(),
	data: z.record(z.string(), z.string()),
})

const document: z.ZodType<IntrospectionDocument> = z.object({
	version: z.literal(WORDPRESS_INTROSPECTION_VERSION),
	hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
	schemas: z.record(z.string(), schema),
	apis: z.record(z.string(), api),
	diagnostics: z.array(diagnostic),
})

export class InvalidIntrospectionDocumentError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "InvalidIntrospectionDocumentError"
	}
}

/**
 * WordPress published a well-formed document written to a contract this package does not speak. The
 * remedy is an upgrade on one side or the other, never an edit to anything the user wrote, so it is
 * reported on its own rather than as a failed field: the version is the only difference that matters,
 * and every other one the schema would report follows from it.
 */
export class IntrospectionVersionError extends Error {
	/** The version this package speaks. */
	readonly expected: string
	/** The version WordPress published. */
	readonly received: string

	constructor(received: string) {
		super(versionMessage(received))
		this.name = "IntrospectionVersionError"
		this.expected = WORDPRESS_INTROSPECTION_VERSION
		this.received = received
	}
}

/** A `major.minor` version as numbers, or null for anything that is not one. */
function parseVersion(value: string): [number, number] | null {
	const parts = value.trim().split(".")
	if (parts.length !== 2) return null
	const [major, minor] = parts.map(Number) as [number, number]
	if (![major, minor].every((part) => Number.isInteger(part) && part >= 0)) return null
	return [major, minor]
}

/**
 * Which side is behind, and what to do about it. A version that will not parse orders against
 * nothing, so it names both remedies and leaves the choice rather than guessing a direction.
 */
function versionMessage(received: string): string {
	const published = parseVersion(received)
	const understood = parseVersion(WORDPRESS_INTROSPECTION_VERSION)
	const summary = `WordPress published introspection ${received}`
	if (!published || !understood) {
		return `${summary}, and this kizlo understands ${WORDPRESS_INTROSPECTION_VERSION}. Update the kizlo package and the Kizlo plugin in WordPress.`
	}
	const ahead = published[0] - understood[0] || published[1] - understood[1]
	return ahead > 0
		? `${summary}, newer than the ${WORDPRESS_INTROSPECTION_VERSION} this kizlo understands. Update the kizlo package.`
		: `${summary}, older than the ${WORDPRESS_INTROSPECTION_VERSION} this kizlo understands. Update the Kizlo plugin in WordPress.`
}

/** The document's own `version`, when it declares one as a string; anything else is left to the schema. */
function declaredVersion(value: unknown): string | undefined {
	if (typeof value !== "object" || value === null) return undefined
	const version = (value as { version?: unknown }).version
	return typeof version === "string" ? version : undefined
}

export function parseIntrospectionDocument(value: unknown): IntrospectionDocument {
	// Ahead of the schema, so a document written to another version is answered with the upgrade that
	// fixes it instead of a field-level report nobody can act on.
	const version = declaredVersion(value)
	if (version !== undefined && version !== WORDPRESS_INTROSPECTION_VERSION) throw new IntrospectionVersionError(version)

	const result = document.safeParse(value)
	if (result.success) return result.data
	throw new InvalidIntrospectionDocumentError(`Invalid WordPress introspection document:\n${z.prettifyError(result.error)}`)
}
