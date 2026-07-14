// ====================================================
// GEO
// ====================================================

export type { ContinentCode, Country, CountryCode, Currency, CurrencyCode, DimensionsUnit, WeightUnit } from "./geo"
export {
	CONTINENT_CODES,
	COUNTRIES,
	COUNTRY_CODES,
	CURRENCIES,
	CURRENCY_CODES,
	DIMENSIONS_UNITS,
	WEIGHT_UNITS,
} from "./geo"

// ====================================================
// ADDRESS
// ====================================================

export { toAddressString } from "./address"

// ====================================================
// SECTION NAME
// ====================================================

export { handlebars } from "./handlebars"
export type { RandomOptions } from "./random"
export {
	ALPHABET_HEXADECIMAL,
	ALPHABET_NUMBERS,
	customAlphabet,
	REGEX_HEXADECIMAL,
	random,
	STANDARD_ID_LENGTH,
	trimRandomPrefix,
} from "./random"
export type {
	ErrorCodeLike,
	InferError,
	InferSuccess,
	Result,
	ResultError,
	ResultSuccess,
	TryCatchError,
	TryCatchResult,
	TryCatchSuccess,
} from "./result"
export { error, isResult, ResultErrorException, success, tryCatch, tryCatchSync } from "./result"
export type { PathMatcherParam } from "./url"
export * from "./url"

// ====================================================
// SCHEMA
// ====================================================

export type { PasswordStrengthResult } from "./password"

// ====================================================
// PASSWORD
// ====================================================

export { checkPasswordStrength, isStrongPassword, PasswordSchema } from "./password"
export * from "./schema"

// ====================================================
// TIME
// ====================================================

export * from "./base64"
export * from "./metadata"
export type { DurationLabel, DurationString } from "./time"
export {
	Duration,
	date,
	duration,
	isValidTimestampMs,
	isValidTimestampSec,
	milliseconds,
	remainingDurationMs,
	remainingDurationSec,
	seconds,
	timestampMs,
	timestampSec,
} from "./time"
export type * from "./typescript"
export { parseUserAgent } from "./user-agent"

// ====================================================
// SETTINGS
// ====================================================

export type * from "./settings"

// ====================================================
// WEBHOOK
// ====================================================

export * from "./query"
export * from "./webhook"
