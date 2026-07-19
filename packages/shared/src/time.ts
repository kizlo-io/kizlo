import * as itty from "itty-time"
import z from "zod/v4"

export type DurationLabel = "second" | "minute" | "hour" | "day" | "week" | "month" | "year"

export type DurationString = `${number} ${DurationLabel}${"s" | ""}`

export type Duration = DurationString | number

const DURATION_REGEX = /^([+-]?(?:\d+)(?:\.\d+)?) (second|minute|hour|day|week|month|year)s?$/

export const duration = (milliseconds: number, parts?: number): string => itty.duration(milliseconds, { parts }) as string

export const milliseconds = (duration: Duration): number => itty.ms(duration)

export const seconds = (duration: Duration): number => itty.seconds(duration)

export const date = (duration: Duration, from?: Date): Date => itty.datePlus(duration, from)

export const Duration = z
	.union([
		z.number(),
		z.string().regex(DURATION_REGEX, {
			message:
				'Expected string of form "<number> <unit>" where <unit> is one of: second, minute, hour, day, week, month, year — case-sensitive and exactly one space; optional trailing "s". Example: "1.5 hour" or "3 days"',
		}),
	])
	.pipe(z.custom<Duration>())

/**
 * Validates if a number is a valid timestamp in seconds.
 * Checks if the value is within a reasonable range for Unix timestamps in seconds.
 * @param value - Number to validate
 * @returns boolean - True if valid seconds timestamp
 * @example
 * isValidTimestampSec(1700000000); // true (Nov 2023)
 * isValidTimestampSec(1700000000000); // false (milliseconds, not seconds)
 * isValidTimestampSec(100); // false (too old - 1970)
 */
export const isValidTimestampSec = (value: number): boolean => {
	const MIN_TIMESTAMP_SEC = 946684800
	const MAX_TIMESTAMP_SEC = 4102444800
	return Number.isFinite(value) && value >= MIN_TIMESTAMP_SEC && value <= MAX_TIMESTAMP_SEC
}

/**
 * Validates if a number is a valid timestamp in milliseconds.
 * Checks if the value is within a reasonable range for Unix timestamps in milliseconds.
 * @param value - Number to validate
 * @returns boolean - True if valid milliseconds timestamp
 * @example
 * isValidTimestampMs(1700000000000); // true (Nov 2023)
 * isValidTimestampMs(1700000000); // false (seconds, not milliseconds)
 * isValidTimestampMs(100000); // false (too old - 1970)
 */
export const isValidTimestampMs = (value: number): boolean => {
	const MIN_TIMESTAMP_MS = 946684800000
	const MAX_TIMESTAMP_MS = 4102444800000
	return Number.isFinite(value) && value >= MIN_TIMESTAMP_MS && value <= MAX_TIMESTAMP_MS
}

/**
 * Converts a WordPress GMT date string to epoch milliseconds, treating null,
 * undefined, and unparseable values as absent (`null`) rather than `NaN`.
 *
 * WordPress emits its `*_gmt` fields in UTC but without a timezone designator
 * (e.g. `"2023-11-14T10:00:00"`); a bare date-time string is parsed in the host's
 * local timezone, so a `Z` is appended to force UTC. Pass the `*_gmt` fields, not
 * the site-local ones. WP also returns `null` dates for statuses like `auto-draft`,
 * so callers get a clean sentinel instead of a `NaN` timestamp.
 *
 * @param value - A WP GMT date string, or null/undefined.
 * @returns number (milliseconds) or null when the value cannot be resolved.
 * @example
 * resolveWpTimestamp("2023-11-14T10:00:00"); // 1699956000000 (parsed as UTC)
 * resolveWpTimestamp(null); // null
 */
export const resolveWpTimestamp = (value: string | null | undefined): number | null => {
	if (!value) return null
	const hasTimezone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value)
	const normalized = value.includes("T") && !hasTimezone ? `${value}Z` : value
	const time = new Date(normalized).getTime()
	return Number.isNaN(time) ? null : time
}

/**
 * Gives current timestamp in milliseconds.
 * @param date - You can pass optional date to convert to timestamp.
 * @returns number (milliseconds)
 */
export const timestampMs = (date?: Date): number => date?.getTime() ?? Date.now()

/**
 * Gives current timestamp in seconds.
 * @param date - You can pass optional date to convert to timestamp.
 * @returns number (seconds)
 */
export const timestampSec = (date?: Date): number => Math.floor(timestampMs(date) / 1000)

/**
 * Calculates the remaining duration from now until a future timestamp.
 * @param futureTimestampMs - Future timestamp in milliseconds
 * @returns number - Remaining duration in milliseconds (0 if timestamp is in the past)
 * @example
 * const expiresAt = Date.now() + 60000; // 1 minute from now
 * const remaining = remainingDurationMs(expiresAt); // ~60000
 */
export const remainingDurationMs = (futureTimestampMs: number): number => Math.max(futureTimestampMs - timestampMs(), 0)

/**
 * Calculates the remaining duration from now until a future timestamp in seconds.
 * @param futureTimestampSec - Future timestamp in seconds
 * @returns number - Remaining duration in seconds (0 if timestamp is in the past)
 * @example
 * const expiresAt = Math.floor(Date.now() / 1000) + 60; // 1 minute from now
 * const remaining = remainingDurationSec(expiresAt); // ~60
 */
export const remainingDurationSec = (futureTimestampSec: number): number => Math.max(futureTimestampSec - timestampSec(), 0)
