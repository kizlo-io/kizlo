import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "vitest"
import type { TestCredentials } from "../wp/types"
import { wordPressCredentialsFromTestArtifact } from "./_test-wordpress"
import { findGeneratedFileMismatches, formatGeneratedFileDiff } from "./check"

describe("generated file checks", () => {
	test("accepts every configured file when each contains the generated output", () => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-check-"))
		const files = [path.join(cwd, "introspection.ts"), path.join(cwd, "app/introspection.ts")]
		for (const file of files) {
			fs.mkdirSync(path.dirname(file), { recursive: true })
			fs.writeFileSync(file, "current\n")
		}

		expect(findGeneratedFileMismatches(files, "current\n")).toEqual([])
	})

	test("reports stale and missing files without writing either one", () => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-check-"))
		const stale = path.join(cwd, "introspection.ts")
		const missing = path.join(cwd, "app/introspection.ts")
		fs.writeFileSync(stale, "old field\n")

		const mismatches = findGeneratedFileMismatches([stale, missing], "new field\n")

		expect(mismatches).toHaveLength(2)
		expect(fs.readFileSync(stale, "utf8")).toBe("old field\n")
		expect(fs.existsSync(missing)).toBe(false)
		expect(formatGeneratedFileDiff(cwd, mismatches[0] as (typeof mismatches)[number])).toContain(
			"--- introspection.ts\tcommitted\n+++ introspection.ts\tgenerated\n@@ -1,1 +1,1 @@\n-old field\n+new field",
		)
	})
})

describe("test WordPress credentials", () => {
	const artifact: TestCredentials = {
		url: "http://localhost:8889",
		project: "kizlo-test",
		users: {
			admin: {
				id: 1,
				email: "admin@example.com",
				firstName: "Test",
				lastName: "Admin",
				username: "admin",
				password: "password",
				applicationPassword: "application-password",
			},
			user: {
				id: 2,
				email: "user@example.com",
				firstName: "Test",
				lastName: "User",
				username: "user",
				password: "password",
				role: "subscriber",
			},
		},
		fixtures: {},
	}

	test("uses the admin application password from the current test stack", () => {
		expect(wordPressCredentialsFromTestArtifact(artifact, "kizlo-test")).toEqual({
			url: "http://localhost:8889",
			username: "admin",
			password: "application-password",
		})
	})

	test("refuses credentials left by another branch's stack", () => {
		expect(() => wordPressCredentialsFromTestArtifact(artifact, "kizlo-other-test")).toThrow("another WordPress stack")
	})
})
