import type { RandomReader } from "@oslojs/crypto/random"
import { generateRandomString } from "@oslojs/crypto/random"

/** Default length for generated random IDs, including any prefix and underscore separator. */
export const STANDARD_ID_LENGTH = 32

/** Numeric alphabet (0-9) for use with `random()` or `customAlphabet()`. */
export const ALPHABET_NUMBERS = "0123456789"

/** Hexadecimal alphabet (0-9, a-f) for use with `random()` or `customAlphabet()`. */
export const ALPHABET_HEXADECIMAL = "0123456789abcdef"

/** Regex for validating a hex string of exactly `STANDARD_ID_LENGTH` characters. */
export const REGEX_HEXADECIMAL = new RegExp(`^[${ALPHABET_HEXADECIMAL}]{${STANDARD_ID_LENGTH}}$`)

export interface RandomOptions {
	/** Optional prefix to prepend to the generated ID, separated by an underscore (e.g. `"sk"` → `"sk_..."`). */
	prefix?: string
	/** Custom alphabet to generate the random portion from. Defaults to `ALPHABET_HEXADECIMAL`. */
	alphabet?: string
	/** Total length of the output string, including prefix and underscore separator. Defaults to `STANDARD_ID_LENGTH`. */
	length?: number
}

/**
 * A cryptographically secure `RandomReader` backed by `globalThis.crypto.getRandomValues`.
 * Reused across all calls to avoid recreating the reader on every invocation.
 */
const randomReader: RandomReader = {
	read(bytes: Uint8Array) {
		globalThis.crypto.getRandomValues(bytes as never)
	},
}

/**
 * Removes the prefix (everything before the first underscore) from an ID string.
 *
 * @param id - The input string that may contain a prefix separated by an underscore.
 * @returns The string without the prefix. If no underscore is present, the original string is returned unchanged.
 *
 * @example
 * trimRandomPrefix("user_a3f92bc4"); // => "a3f92bc4"
 * trimRandomPrefix("abc_def_ghi");   // => "def_ghi"
 * trimRandomPrefix("noprefix");      // => "noprefix"
 */
export const trimRandomPrefix = (id: string) => id.replace(/^[^_]+_/, "")

/**
 * Creates a reusable random string generator for a given alphabet and size.
 *
 * @param alphabet - The set of characters to generate from. Must not be empty.
 * @param size - The number of characters to generate. Must be a positive integer.
 * @returns A function that generates a random string of the given size on each call.
 *
 * @throws If `alphabet` is empty or `size` is not a positive integer.
 *
 * @example
 * const gen = customAlphabet("abc", 6);
 * gen(); // => "bcaacb"
 */
export function customAlphabet(alphabet: string, size: number) {
	if (alphabet.length === 0) throw new Error("alphabet must not be empty")
	if (!Number.isFinite(size) || size < 1) throw new Error("size must be a positive integer")
	return () => generateRandomString(randomReader, alphabet, size)
}

/**
 * Generates a cryptographically secure random ID string with an optional prefix.
 *
 * The `length` option represents the **total** output length including the prefix and
 * underscore separator. The random portion will be `length - prefix.length - 1` characters.
 *
 * @param [options] - Optional settings for customizing the output.
 * @param [options.prefix] - Prefix to prepend, separated by an underscore (e.g. `"sk"` → `"sk_..."`).
 * @param [options.length] - Total output length including prefix and separator. Defaults to `STANDARD_ID_LENGTH`.
 * @param [options.alphabet] - Custom alphabet for the random portion. Defaults to `ALPHABET_HEXADECIMAL`.
 *
 * @returns A random ID string, formatted as `"prefix_randomPortion"` if a prefix is given, otherwise just `"randomPortion"`.
 *
 * @throws If the total `length` is too short to accommodate the prefix and separator.
 *
 * @example
 * random();                                  // => "a3f92bc4d81e9f7c..."         (32 hex chars)
 * random({ prefix: "sk", length: 32 });      // => "sk_a3f92bc4..."              (32 chars total)
 * random({ alphabet: "01", length: 10 });    // => "0110011010"                  (10 binary chars)
 */
export function random(options?: RandomOptions): string {
	const prefix = options?.prefix
	const totalLength = options?.length ?? STANDARD_ID_LENGTH
	const randomLength = prefix !== undefined ? totalLength - prefix.length - 1 : totalLength

	if (randomLength < 1) throw new Error(`length too short to accommodate prefix "${prefix}"`)

	const alphabet = options?.alphabet ?? ALPHABET_HEXADECIMAL
	const core = customAlphabet(alphabet, randomLength)()

	return prefix !== undefined ? `${prefix}_${core}` : core
}
