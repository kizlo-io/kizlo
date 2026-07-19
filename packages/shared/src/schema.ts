import type { StandardSchemaV1 } from "@standard-schema/spec"
import z from "zod/v4"

// ====================================================
// HELPERS
// ====================================================

/**
 * Creates a Zod schema that accepts either a single value or an array of that value.
 * Useful for WordPress/WooCommerce params that accept both forms.
 *
 * @example
 * arrayable(z.number()) // → number | number[]
 * arrayable(z.string()) // → string | string[]
 */
export const arrayable = <T extends z.ZodTypeAny>(schema: T) => z.union([schema, z.array(schema)])

/**
 * Wrap an optional field so an invalid value is dropped (parsed to `undefined`)
 * instead of throwing. Intended for lenient read surfaces such as list-query
 * filters, where a bad value should degrade gracefully rather than 400. Do not
 * use it on inputs where a wrong value must fail loudly (single-resource fetches,
 * writes).
 *
 * @example
 * lenient(z.enum(["asc", "desc"])) // "bogus" → undefined instead of a ZodError
 */
export const lenient = <T extends z.ZodTypeAny>(schema: T) => schema.optional().catch(undefined)

export function normalizeArrayableValue<T>(val: T | T[] | undefined): T[] | undefined {
	if (val == null) return undefined
	return Array.isArray(val) ? val : [val]
}

// ====================================================
// SCHEMA
// ====================================================

export type JSONValue = string | number | boolean | null | JSONValue[] | { [k: string]: JSONValue }
/**
 * Annotated wrapper around `z.json()`.
 *
 * Raw `z.json()` infers a type that leans on Zod's internal `zod/v4/core/util`
 * helpers. Those live at a deep path that isn't in Zod's public `exports`, so
 * when `tsc` emits `.d.ts` for any package re-exporting the schema it fails
 * with TS2742 ("inferred type ... cannot be named without a reference to
 * ../node_modules/zod/v4/core/util.cjs").
 *
 * Annotating with the locally-declared `JSONValue` stops inference at this
 * boundary — the emitted `.d.ts` references `JSONValue` from this file
 * instead of a non-portable node_modules path. Always import this from here;
 * do not call `z.json()` directly in exported schemas.
 */
export const jsonSchema: z.ZodType<JSONValue> = z.json()

/**
 * Key/value metadata attached to a resource. All values are strings.
 * Complex values like arrays or objects are JSON stringified and must be parsed by the consumer.
 */
export const Metadata = z.record(z.string(), jsonSchema)
export type Metadata = z.infer<typeof Metadata>
export type WithMetadata<T, TMeta extends Metadata> = Omit<T, "meta"> & { meta: TMeta }

export const NumberLike = z.union([z.string(), z.number()]).pipe(z.coerce.number())

export const BooleanLike = z.union([z.boolean(), z.stringbool()])

// ====================================================
// MEDIA
// ====================================================

export const Media = z.object({
	id: z.number(),
	name: z.string(),
	alt: z.string(),
	src: z.string(),
	mime: z.string().optional(),
	width: z.number().optional(),
	height: z.number().optional(),
	variants: z.array(z.object({ src: z.string(), width: z.number(), height: z.number() })).optional(),
	srcset: z.string().optional(),
})
export type Media = z.infer<typeof Media>

// ====================================================
// COOKIE
// ====================================================

export const Cookie = z.object({
	name: z.string(),
	value: z.string(),
})
export type Cookie = z.infer<typeof Cookie>

export const CookieOptions = z.object({
	expires: z.date().optional(),
	domain: z.string().optional(),
	path: z.string().optional(),
	httpOnly: z.boolean().optional(),
	secure: z.boolean().optional(),
	partitioned: z.boolean().optional(),
	priority: z.enum(["low", "medium", "high"]).optional(),
	sameSite: z.enum(["lax", "strict", "none"]).optional(),
})
export type CookieOptions = z.infer<typeof CookieOptions>

export const CookieWithOptions = z.object({
	name: z.string(),
	value: z.string(),
	options: CookieOptions.optional(),
})
export type CookieWithOptions = z.infer<typeof CookieWithOptions>

// ====================================================
// STANDARD SCHEMA
// ====================================================

export type Schema<TInput = unknown, TOutput = TInput> = StandardSchemaV1<TInput, TOutput>

export type SchemaInput<T> = T extends Schema ? StandardSchemaV1.InferInput<T> : never
export type SchemaOutput<T> = T extends Schema ? StandardSchemaV1.InferOutput<T> : never
export type SchemaIssue = StandardSchemaV1.Issue

export async function safeValidateSchema<T extends Schema>(
	schema: T,
	data: unknown,
): Promise<{ success: true; value: SchemaInput<T> } | { success: false; issues: StandardSchemaV1.Issue[] }> {
	const result = await schema["~standard"].validate(data)
	if (result.issues) {
		return { success: false, issues: result.issues as never }
	}
	return { success: true, value: result.value as SchemaInput<T> }
}
