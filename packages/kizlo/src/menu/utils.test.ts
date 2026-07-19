import { expect, test } from "vitest"
import { extractPath } from "./utils"

test("extractPath returns the full pathname for a non-custom item, not just the leaf", () => {
	expect(extractPath("https://site.com/about-us/team", false)).toBe("/about-us/team")
	expect(extractPath("https://site.com/", false)).toBe("/")
	expect(extractPath("/about", false)).toBe("/about")
})

test("extractPath passes a custom link through verbatim, keeping external hosts", () => {
	expect(extractPath("/contact", true)).toBe("/contact")
	expect(extractPath("https://twitter.com/kizlo", true)).toBe("https://twitter.com/kizlo")
})

test("extractPath resolves the same internal path whether custom or linked", () => {
	expect(extractPath("/about-us/team", true)).toBe(extractPath("https://site.com/about-us/team", false))
})

test("extractPath falls back to `/` for an empty url", () => {
	expect(extractPath("", false)).toBe("/")
	expect(extractPath("   ", true)).toBe("/")
})
