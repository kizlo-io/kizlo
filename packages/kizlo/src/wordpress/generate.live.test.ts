import { expect, test } from "vitest"
import { getTestCredentials } from "../cli/wp/utils"
import { fetchIntrospection } from "./fetch-introspection"
import { generateWordPressModule } from "./generate"
import { assertGeneratedClientCompiles } from "./typecheck"

/**
 * The generator against the WordPress the test stack is running, rather than against a document
 * written by hand.
 *
 * Every other suite feeds the generator a document a test author wrote, so none of them fails when
 * the plugin starts publishing a shape the generator mishandles. This one compiles against the
 * built declarations too, making it the only place the module a real project receives is checked
 * against the real `kizlo` rather than a stub.
 *
 * Requires `dist/`, which CI builds before booting the stack. A run without it would compile
 * nothing and pass, so the check reports whether it ran and this asserts that it did.
 */
test("generates a compiling client from what WordPress actually publishes", async () => {
	const credentials = getTestCredentials()
	const result = await fetchIntrospection({
		url: credentials.url,
		username: credentials.users.admin.username,
		password: credentials.users.admin.applicationPassword,
	})

	if (!result.document) throw new Error("WordPress served no introspection document.")
	expect(result.document.diagnostics.filter((diagnostic) => diagnostic.type === "error")).toEqual([])

	const generated = generateWordPressModule(result.document)

	expect(generated.declarations.length).toBeGreaterThan(0)
	await expect(assertGeneratedClientCompiles(generated)).resolves.toBe("checked")
}, 60_000)
