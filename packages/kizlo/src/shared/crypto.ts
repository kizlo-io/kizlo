import { type BinaryLike, createHash, createHmac, timingSafeEqual } from "node:crypto"

/**
 * Compares two strings in a timing-safe manner to prevent timing attacks.
 *
 * @param a - The first string to compare.
 * @param b - The second string to compare.
 * @returns `true` if the strings match, `false` otherwise.
 */
export function compare(a: string, b: string) {
	return timingSafeEqual(Buffer.from(a), Buffer.from(b))
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
export function hash(key: string): string {
	return createHash("sha256").update(key).digest("hex")
}

/**
 * Create hmac using node crypto lib.
 */
export function hmac(key: string, value: BinaryLike) {
	return createHmac("sha256", key).update(value).digest("hex")
}
