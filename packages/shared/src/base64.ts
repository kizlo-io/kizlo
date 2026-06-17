/**
 * Encodes data to a base64url string (JWT-style encoding).
 * Uses URL-safe base64 encoding without padding.
 *
 * @example
 * ```typescript
 * const data = { user: { id: 1 }, token: 'abc123' }
 * const encoded = base64Encode(data)
 * // => 'eyJ1c2VyIjp7ImlkIjoxfSwidG9rZW4iOiJhYmMxMjMifQ'
 * ```
 */
export function base64Encode(data: unknown): string {
	const json = JSON.stringify(data)
	return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

/**
 * Decodes a base64url encoded string back to typed data.
 * Supports both standard base64 and URL-safe base64url formats.
 *
 * @example
 * ```typescript
 * // Returns null on error
 * const data = base64Decode<UserData>(encoded)
 * if (data) {
 *   console.log(data.id)
 * }
 * ```
 */
export function base64Decode<T>(encoded: string, throwOnError?: true): T | null {
	try {
		const base64 = encoded
			.replace(/-/g, "+")
			.replace(/_/g, "/")
			.padEnd(encoded.length + ((4 - (encoded.length % 4)) % 4), "=")
		return JSON.parse(atob(base64)) as T
	} catch (error) {
		if (throwOnError) throw error
		return null as never
	}
}
