import qs from "qs"

export interface StringifyOptions {
	/**
	 * Skip null and undefined values. Defaults to `true`.
	 * Sending empty params (`?category=`) can behave differently
	 * than a missing param on some servers — safer to omit them.
	 */
	skipNulls?: boolean

	/**
	 * URI encode keys and values. Defaults to `false`.
	 * Commas in comma-separated arrays must stay unencoded
	 * for WordPress/WooCommerce to parse them correctly.
	 */
	encode?: boolean
}

export interface ParseOptions {
	/**
	 * Auto-cast numeric strings to numbers. Defaults to `true`.
	 * e.g. `"10"` → `10`
	 */
	parseNumbers?: boolean

	/**
	 * Auto-cast `"true"` / `"false"` strings to booleans. Defaults to `true`.
	 * e.g. `"true"` → `true`
	 */
	parseBooleans?: boolean
}

export type SearchParamsLike = Record<string, unknown>

function isObjectArray(val: unknown): val is SearchParamsLike[] {
	return Array.isArray(val) && val.length > 0 && typeof val[0] === "object" && val[0] !== null
}

/**
 * Converts a params object to a WordPress/WooCommerce compatible query string.
 *
 * - Plain scalar arrays                   → comma-separated  (`categories=1,2,3`)
 * - Arrays of objects                     → indexed brackets (`attributes[0][operator]=in`)
 * - Scalar arrays nested inside objects   → comma-separated  (`attributes[0][slug]=red,blue`)
 * - Nested objects                        → bracket notation (`meta_query[key]=color`)
 *
 * @example
 * stringifyQueryString({ categories: [1, 2], per_page: 10 })
 * // → "categories=1,2&per_page=10"
 *
 * stringifyQueryString({ attributes: [{ slug: ['red', 'blue'], operator: 'in' }] })
 * // → "attributes[0][slug]=red,blue&attributes[0][operator]=in"
 */
export function stringifyQueryString(params: SearchParamsLike, options: StringifyOptions = {}): string {
	const shared = {
		skipNulls: options.skipNulls ?? true,
		encode: options.encode ?? false,
		allowPrototypes: false,
	}

	let hasComma = false
	let hasIndices = false
	const commaParams: SearchParamsLike = {}
	const indicesParams: SearchParamsLike = {}

	for (const key in params) {
		if (!Object.hasOwn(params, key)) continue
		const val = params[key]
		if (isObjectArray(val)) {
			indicesParams[key] = val
			hasIndices = true
		} else {
			commaParams[key] = val
			hasComma = true
		}
	}

	const parts: string[] = []

	if (hasComma) {
		parts.push(qs.stringify(commaParams, { ...shared, arrayFormat: "comma" }))
	}

	if (hasIndices) {
		parts.push(
			qs.stringify(indicesParams, {
				...shared,
				arrayFormat: "indices",
				filter: (_prefix: string, value: unknown) => {
					if (Array.isArray(value) && !isObjectArray(value)) {
						return (value as unknown[]).join(",")
					}
					return value
				},
			}),
		)
	}

	return parts.filter(Boolean).join("&")
}

/**
 * Parses a WordPress/WooCommerce query string back into a typed object.
 *
 * Handles bracket notation, indexed arrays, and comma-separated scalar arrays.
 *
 * @example
 * parseQueryString('?categories=1,2,3', { parseNumbers: true })
 * // → { categories: [1, 2, 3] }
 *
 * parseQueryString('attributes[0][slug]=red,blue&attributes[0][operator]=in')
 * // → { attributes: [{ slug: ['red', 'blue'], operator: 'in' }] }
 */
export function parseQueryString<T extends SearchParamsLike>(
	query: string,
	options: ParseOptions = {
		parseNumbers: true,
		parseBooleans: true,
	},
): T {
	return qs.parse(query, {
		ignoreQueryPrefix: true,
		parseArrays: true,
		allowPrototypes: false,
		comma: true,
		decoder:
			options.parseNumbers || options.parseBooleans
				? (str, defaultDecoder) => {
						if (options.parseNumbers && str !== "" && !Number.isNaN(Number(str))) return Number(str)
						if (options.parseBooleans && str === "true") return true
						if (options.parseBooleans && str === "false") return false
						return defaultDecoder(str)
					}
				: undefined,
	}) as T
}
