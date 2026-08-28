import { describe, expect, test } from "vitest"
import { timestampFromIso, timestampFromWpGmt } from "./time"

function inTimezone<T>(timezone: string, read: () => T): T {
	const original = process.env.TZ
	process.env.TZ = timezone

	try {
		return read()
	} finally {
		if (original === undefined) delete process.env.TZ
		else process.env.TZ = original
	}
}

describe("timestampFromWpGmt", () => {
	test("treats a bare WordPress GMT value as UTC in every host timezone", () => {
		const expected = Date.UTC(2026, 0, 2, 3, 4, 5)

		expect(inTimezone("UTC", () => timestampFromWpGmt("2026-01-02T03:04:05"))).toBe(expected)
		expect(inTimezone("Asia/Kolkata", () => timestampFromWpGmt("2026-01-02T03:04:05"))).toBe(expected)
	})

	test.each([undefined, null, "", "not-a-date", "2026-02-30T03:04:05"])("returns null for an absent or invalid value", (value) => {
		expect(timestampFromWpGmt(value)).toBeNull()
	})

	test.each(["2026-01-02", "2026-01-02T03:04:05Z", "2026-01-02T03:04:05+05:30"])(
		"rejects values outside the bare WordPress GMT format",
		(value) => {
			expect(timestampFromWpGmt(value)).toBeNull()
		},
	)
})

describe("timestampFromIso", () => {
	test("normalizes Z and numeric offsets in every host timezone", () => {
		const zulu = Date.UTC(2026, 0, 2, 3, 4, 5)
		const offset = Date.UTC(2026, 0, 1, 21, 34, 5)

		for (const timezone of ["UTC", "Asia/Kolkata"]) {
			expect(inTimezone(timezone, () => timestampFromIso("2026-01-02T03:04:05Z"))).toBe(zulu)
			expect(inTimezone(timezone, () => timestampFromIso("2026-01-02T03:04:05+05:30"))).toBe(offset)
		}
	})

	test.each([undefined, null, "", "not-a-date", "2026-02-30T03:04:05Z"])("returns null for an absent or invalid value", (value) => {
		expect(timestampFromIso(value)).toBeNull()
	})

	test.each(["2026-01-02", "2026-01-02T03:04:05", "2026-01-02T03:04:05+0530"])("rejects values without an RFC 3339 timezone", (value) => {
		expect(timestampFromIso(value)).toBeNull()
	})
})
