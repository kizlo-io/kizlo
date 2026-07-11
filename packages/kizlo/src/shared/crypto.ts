const encoder = new TextEncoder()

function toHex(buffer: ArrayBuffer): string {
	let hex = ""
	for (const byte of new Uint8Array(buffer)) hex += byte.toString(16).padStart(2, "0")
	return hex
}

/**
 * Compares two strings in a timing-safe manner to prevent timing attacks.
 *
 * Both inputs are hashed to fixed-length digests before comparison, so the
 * check is constant-time regardless of input length and never throws on a
 * length mismatch.
 *
 * @param a - The first string to compare.
 * @param b - The second string to compare.
 * @returns `true` if the strings match, `false` otherwise.
 */
export async function compare(a: string, b: string): Promise<boolean> {
	const [ha, hb] = await Promise.all([
		crypto.subtle.digest("SHA-256", encoder.encode(a)),
		crypto.subtle.digest("SHA-256", encoder.encode(b)),
	])
	const va = new Uint8Array(ha)
	const vb = new Uint8Array(hb)
	let diff = 0
	for (let i = 0; i < va.length; i++) diff |= (va[i] ?? 0) ^ (vb[i] ?? 0)
	return diff === 0
}

/**
 * Hashes a secret API key with SHA-256 for secure database storage.
 * Safe to use in place of bcrypt/argon2 because API keys are high-entropy
 * random strings, unlike user-chosen passwords.
 * Only secret keys should be hashed — publishable keys are not sensitive.
 *
 * @param key - The raw secret API key to hash.
 * @returns A SHA-256 hex string suitable for database storage.
 */
export async function hash(key: string): Promise<string> {
	return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(key)))
}

/**
 * Create an HMAC-SHA256 hex digest using the Web Crypto API.
 */
export async function hmac(key: string, value: string): Promise<string> {
	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		encoder.encode(key),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	)
	return toHex(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value)))
}
