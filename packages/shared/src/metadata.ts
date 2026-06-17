import type z from "zod/v4"
import type { Metadata } from "./schema"

export type MetaKey = Lowercase<string>
export type MetadataRecord = Record<string, unknown>
export type KeyValueMetadata = { key: string; value: unknown }
export type MetadataSchemaLike = Record<string, { key: MetaKey; value: z.ZodType }>

export interface DefineMetadataReturn<T extends MetadataSchemaLike> {
	schema: T
	keys(): string[]
	filter(metadata: KeyValueMetadata[]): KeyValueMetadata[]
	create(data: { [Key in keyof T]?: z.output<T[Key]["value"]> | null }): KeyValueMetadata[]
	find(metadata: KeyValueMetadata[] | MetadataRecord): { [R in keyof T]: z.output<T[R]["value"]> | null }
	find<K extends keyof T>(metadata: KeyValueMetadata[] | MetadataRecord, key: K): z.output<T[K]["value"]> | null
}

/**
 * Defines a type-safe metadata schema for WordPress metadata handling.
 *
 * @template T - Record of metadata field definitions with keys and Zod validators
 * @param schema - Object mapping field names to metadata key and Zod schema pairs
 * @returns Utility object with methods to manage WordPress metadata
 *
 * @example
 * ```typescript
 * const orderMetadata = defineMetadata({
 *   invoices: {
 *     key: "kizlo_invoices",
 *     value: z.array(OrderInvoice),
 *   },
 *   customerNotes: {
 *     key: "kizlo_customer_notes",
 *     value: z.string(),
 *   },
 * });
 *
 * // Extract typed data from WordPress metadata
 * const typed = orderMetadata.find(wpOrder.metadata);
 *
 * // Create WordPress metadata from typed data
 * const meta = orderMetadata.create({ invoices: [...], customerNotes: "..." });
 *
 * // Remove schema keys from metadata array
 * const remaining = orderMetadata.filter(wpOrder.metadata);
 * ```
 */
export function defineMetadata<T extends MetadataSchemaLike>(schema: T): DefineMetadataReturn<T> {
	return {
		/**
		 * The metadata schema definition.
		 * Useful for accessing validators directly or inferring types.
		 *
		 * @example
		 * ```typescript
		 * // Access a specific validator
		 * const invoiceValidator = orderMetadata.schema.invoices.value;
		 *
		 * // Parse manually
		 * const parsed = orderMetadata.schema.invoices.value.parse(data);
		 *
		 * // Get the meta key
		 * const metaKey = orderMetadata.schema.invoices.key;
		 * // => 'kizlo_invoices'
		 * ```
		 */
		schema,

		/**
		 * Returns all metadata keys defined in the schema.
		 *
		 * @returns Array of metadata key strings
		 *
		 * @example
		 * ```typescript
		 * const keys = orderMetadata.keys();
		 * // => ['kizlo_invoices', 'kizlo_customer_notes']
		 * ```
		 */
		keys(): string[] {
			return Object.values(schema).map((a) => a.key)
		},

		/**
		 * Creates a WordPress metadata array from typed data.
		 * Validates data against schema and serializes values to JSON strings.
		 * Skips undefined values to support partial updates.
		 *
		 * @param data - Object with typed metadata values (partial updates supported)
		 * @returns Array of WordPress metadata entries ready for storage
		 * @throws {ZodError} If validation fails for any provided value
		 *
		 * @example
		 * ```typescript
		 * const metadata = orderMetadata.create({
		 *   invoices: [{ id: 'INV-002', amount: 250 }],
		 *   customerNotes: 'Rush order',
		 * });
		 * // => [
		 * //   { key: 'kizlo_invoices', value: '[{"id":"INV-002","amount":250}]' },
		 * //   { key: 'kizlo_customer_notes', value: '"Rush order"' }
		 * // ]
		 *
		 * // Partial update (only update invoices)
		 * const partial = orderMetadata.create({ invoices: [...] });
		 * ```
		 */
		create(data: { [K in keyof T]?: z.output<T[K]["value"]> | null }): KeyValueMetadata[] {
			const result: KeyValueMetadata[] = []

			for (const schemaKey in schema) {
				const keyValuePair = schema[schemaKey]
				if (!keyValuePair) continue

				const dataValue = data[schemaKey]
				if (dataValue === undefined) continue

				const validated = dataValue === null ? null : keyValuePair.value.parse(dataValue)
				result.push({
					key: keyValuePair.key,
					value: maybeStringify(validated),
				})
			}

			return result
		},

		/**
		 * Finds and parses metadata from a WordPress metadata array or record.
		 * Can be called with just metadata to get all fields, or with a specific key to get one field.
		 * Deserializes JSON values and validates them against the schema.
		 * Supports both WooCommerce (array) and WordPress Core (record) formats.
		 *
		 * @param metadata - Array of WordPress metadata entries or meta record object
		 * @param key - Optional schema key to find a specific field
		 * @returns Object with all parsed values, or a single parsed value if key is provided
		 *
		 * @example
		 * ```typescript
		 * // Get all metadata fields
		 * const wpMetadata = [
		 *   { key: 'kizlo_invoices', value: '[{"id":"INV-001","amount":100}]' },
		 * ];
		 * const all = orderMetadata.find(wpMetadata);
		 * // => { invoices: [{id: 'INV-001', amount: 100}], customerNotes: null }
		 *
		 * // Get a specific field
		 * const invoices = orderMetadata.find(wpMetadata, 'invoices');
		 * // => [{id: 'INV-001', amount: 100}]
		 *
		 * // Works with WordPress Core format (record)
		 * const wpMeta = {
		 *   'kizlo_invoices': '[{"id":"INV-001","amount":100}]',
		 * };
		 * const invoices2 = orderMetadata.find(wpMeta, 'invoices');
		 * // => [{id: 'INV-001', amount: 100}]
		 * ```
		 */
		find(metadata: KeyValueMetadata[] | MetadataRecord, key?: keyof T): any {
			// If key is provided, return single value
			if (key !== undefined) {
				const keyValuePair = schema[key]
				if (!keyValuePair) return null

				let metaValue: unknown | undefined

				if (Array.isArray(metadata)) {
					const metaEntry = metadata.find((m) => m.key === keyValuePair.key)
					metaValue = metaEntry?.value
				} else {
					metaValue = metadata[keyValuePair.key]
				}

				if (!metaValue) return null

				try {
					const parsed = safeParseJson(metaValue) as unknown
					const validated = keyValuePair.value.parse(parsed)
					return validated
				} catch {
					return null
				}
			}

			// Otherwise, return all values
			const result = {} as { [K in keyof T]: z.output<T[K]["value"]> | null }

			for (const schemaKey in schema) {
				const keyValuePair = schema[schemaKey]

				if (!keyValuePair) {
					result[schemaKey] = null
					continue
				}

				let metaValue: unknown | undefined

				if (Array.isArray(metadata)) {
					const metaEntry = metadata.find((m) => m.key === keyValuePair.key)
					metaValue = metaEntry?.value
				} else {
					metaValue = metadata[keyValuePair.key]
				}

				if (!metaValue) {
					result[schemaKey] = null
					continue
				}

				try {
					const parsed = safeParseJson(metaValue)
					const validated = keyValuePair.value.parse(parsed)
					result[schemaKey] = validated as never
				} catch {
					result[schemaKey] = null
				}
			}

			return result
		},

		/**
		 * Filters out schema-defined metadata keys from a metadata array.
		 * Useful for removing metadata that has already been extracted to typed fields,
		 * leaving only unrelated metadata in the response.
		 *
		 * @param metadata - Array of WordPress metadata entries
		 * @returns Filtered metadata array excluding schema-defined keys
		 *
		 * @example
		 * ```typescript
		 * const wpMetadata = [
		 *   { key: 'kizlo_invoices', value: '[...]' },
		 *   { key: 'other_plugin_data', value: 'xyz' },
		 * ];
		 * const remaining = orderMetadata.filter(wpMetadata);
		 * // => [{ key: 'other_plugin_data', value: 'xyz' }]
		 *
		 * // Typical usage: clean response object
		 * const response = {
		 *   ...wpOrder,
		 *   ...orderMetadata.find(wpOrder.metadata), // Extract typed fields
		 *   metadata: orderMetadata.filter(wpOrder.metadata), // Keep only other metadata
		 * };
		 * ```
		 */
		filter(metadata: KeyValueMetadata[]): KeyValueMetadata[] {
			const schemaKeys = this.keys()
			return metadata.filter((a) => !schemaKeys.includes(a.key))
		},
	}
}

export function fromMetaArrayToRecord(metadata: KeyValueMetadata[]): MetadataRecord {
	const record: MetadataRecord = {}
	for (const meta of metadata) record[meta.key] = maybeStringify(meta.value)
	return record
}

export function fromMetaRecordToArray(metaRecord: MetadataRecord): KeyValueMetadata[] {
	const data: KeyValueMetadata[] = []
	for (const key of Object.keys(metaRecord)) {
		const value = metaRecord[key]
		if (value) data.push({ key, value: maybeStringify(value) })
	}
	return data
}

export function stringifiedMetaRecord(meta: MetadataRecord, filter?: (key: string) => boolean): Metadata {
	const record: Metadata = {}

	for (const key of Object.keys(meta)) {
		if (filter && !filter?.(key)) continue

		const value = meta[key]
		if (value) record[key] = maybeStringify(value)
	}

	return record
}

export function toPublicMetadata(meta: MetadataRecord | KeyValueMetadata[]): Metadata {
	const record: Metadata = {}

	if (Array.isArray(meta)) {
		for (const { key, value } of meta) {
			if (!key.startsWith("_") && value) record[key] = maybeStringify(value)
		}
	} else {
		for (const key of Object.keys(meta)) {
			const value = meta[key]
			if (!key.startsWith("_") && value) record[key] = maybeStringify(value)
		}
	}

	return record
}

export function maybeStringify(value: unknown): string {
	return typeof value !== "string" ? JSON.stringify(value) : value
}

export type InferMetadata<T extends DefineMetadataReturn<any>> = {
	[K in keyof T["schema"]]: z.output<T["schema"][K]["value"]> | null
}

function safeParseJson<T>(value: unknown): T {
	try {
		return JSON.parse(typeof value !== "string" ? JSON.stringify(value) : value) as T
	} catch {
		return value as T
	}
}
