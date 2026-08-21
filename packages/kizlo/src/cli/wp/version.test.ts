import { describe, expect, test } from "vitest"
import { versionMatchesTag, WORDPRESS_TAG_PATTERN, warnVersionDrift } from "./version"

describe("versionMatchesTag", () => {
	test("matches the tag Docker publishes against the version WordPress reports", () => {
		// Docker tags the release 7.1.0; `wp core version` calls the same release 7.1.
		expect(versionMatchesTag("7.1", "7.1.0")).toBe(true)
		expect(versionMatchesTag("7.1", "7.1.0-apache")).toBe(true)
		expect(versionMatchesTag("7.1", "7.1.0-php8.3-apache")).toBe(true)
	})

	test("matches an exact patch release", () => {
		expect(versionMatchesTag("6.8.2", "6.8.2")).toBe(true)
		expect(versionMatchesTag("6.8.2", "6.8.2-php8.3-apache")).toBe(true)
	})

	test("treats a partial pin as satisfied by any patch under it", () => {
		expect(versionMatchesTag("6.8.2", "6.8")).toBe(true)
		expect(versionMatchesTag("6.8", "6")).toBe(true)
	})

	test("reports a mismatch across releases", () => {
		expect(versionMatchesTag("6.8.2", "7.1.0")).toBe(false)
		expect(versionMatchesTag("7.1", "6.8.2")).toBe(false)
	})

	test("reports a mismatch between patches of one release", () => {
		expect(versionMatchesTag("6.8.1", "6.8.2")).toBe(false)
		expect(versionMatchesTag("7.1", "7.1.1")).toBe(false)
	})

	test("does not confuse a version with one that merely shares a prefix", () => {
		expect(versionMatchesTag("6.81", "6.8")).toBe(false)
		expect(versionMatchesTag("7.11", "7.1")).toBe(false)
	})

	test("passes any tag that names no version, since there is nothing to disagree with", () => {
		expect(versionMatchesTag("7.1", "latest")).toBe(true)
		expect(versionMatchesTag("7.1", "beta")).toBe(true)
		expect(versionMatchesTag("6.8.2", "php8.3-apache")).toBe(true)
	})
})

describe("WORDPRESS_TAG_PATTERN", () => {
	test("accepts the tag forms the option documents", () => {
		for (const tag of ["7.1.0", "7.1.0-apache", "7.1.0-php8.3-apache", "latest", "6.8"]) {
			expect(WORDPRESS_TAG_PATTERN.test(tag)).toBe(true)
		}
	})

	test("rejects a full image reference, which would resolve to wordpress:wordpress:7.1.0", () => {
		expect(WORDPRESS_TAG_PATTERN.test("wordpress:7.1.0")).toBe(false)
		expect(WORDPRESS_TAG_PATTERN.test("docker.io/library/wordpress:7.1.0")).toBe(false)
	})

	test("rejects an empty or separator-led tag", () => {
		for (const tag of ["", ".7.1.0", "-apache", "7.1 .0"]) {
			expect(WORDPRESS_TAG_PATTERN.test(tag)).toBe(false)
		}
	})
})

describe("warnVersionDrift", () => {
	function drift(running: string | Error, tag: string): Promise<string[]> {
		const warnings: string[] = []
		const wpCli = async (): Promise<string> => {
			if (running instanceof Error) throw running
			return running
		}
		return warnVersionDrift({ wpCli, tag, resetCommand: "kizlo test reset", warn: (m) => warnings.push(m) }).then(() => warnings)
	}

	test("names both versions and the command that resolves the difference", async () => {
		const [warning] = await drift("6.8.2", "7.1.0-apache")
		expect(warning).toContain("6.8.2")
		expect(warning).toContain("7.1.0-apache")
		expect(warning).toContain("kizlo test reset")
	})

	test("stays quiet when the install already matches the configured version", async () => {
		expect(await drift("7.1", "7.1.0-apache")).toEqual([])
	})

	test("stays quiet for a tag that names no version", async () => {
		expect(await drift("7.1", "latest")).toEqual([])
	})

	test("stays quiet when the stack cannot report a version", async () => {
		expect(await drift(new Error("wp-cli is not running"), "7.1.0")).toEqual([])
		expect(await drift("", "7.1.0")).toEqual([])
	})
})
