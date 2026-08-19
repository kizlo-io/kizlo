import { describe, expect, test } from "vitest"
import {
	IntrospectionVersionError,
	InvalidIntrospectionDocumentError,
	parseIntrospectionDocument,
	WORDPRESS_INTROSPECTION_VERSION,
} from "./introspection"
import { INTROSPECTION_FIXTURE } from "./introspection.fixture"

function parse(version: string): () => unknown {
	return () => parseIntrospectionDocument({ ...INTROSPECTION_FIXTURE, version })
}

describe("parseIntrospectionDocument", () => {
	test("accepts the supported contract", () => {
		expect(parseIntrospectionDocument(INTROSPECTION_FIXTURE)).toEqual(INTROSPECTION_FIXTURE)
	})

	test("names the kizlo package when WordPress published a newer version", () => {
		expect(parse("1.1")).toThrow(IntrospectionVersionError)
		expect(parse("1.1")).toThrow(
			`WordPress published introspection 1.1, newer than the ${WORDPRESS_INTROSPECTION_VERSION} this kizlo understands. Update the kizlo package.`,
		)
		expect(parse("2.0")).toThrow("Update the kizlo package.")
	})

	test("names the WordPress plugin when WordPress published an older version", () => {
		expect(parse("0.9")).toThrow(
			`WordPress published introspection 0.9, older than the ${WORDPRESS_INTROSPECTION_VERSION} this kizlo understands. Update the Kizlo plugin in WordPress.`,
		)
	})

	test("names both when the published version orders against nothing", () => {
		expect(parse("draft")).toThrow("Update the kizlo package and the Kizlo plugin in WordPress.")
	})

	// The version is the whole report: the schema would name every other field that moved with it, and
	// none of them is something the user can act on.
	test("reports a version mismatch without the schema detail", () => {
		expect(() => parseIntrospectionDocument({ version: "1.1" })).toThrow(IntrospectionVersionError)
		expect(parse("1.1")).not.toThrow("Invalid WordPress introspection document")
	})

	test("rejects malformed operations", () => {
		expect(() =>
			parseIntrospectionDocument({
				...INTROSPECTION_FIXTURE,
				apis: { broken: { namespace: "x/v1", paths: { "/x": { list: { method: ["GET"] } } } } },
			}),
		).toThrow("Invalid WordPress introspection document")
		expect(() =>
			parseIntrospectionDocument({
				...INTROSPECTION_FIXTURE,
				apis: {
					broken: {
						namespace: "x/v1",
						paths: {
							"/x": {
								list: {
									method: "GET",
									errors: [],
									input: { type: "object" },
									responses: { nope: { content_type: "application/yaml" } },
								},
							},
						},
					},
				},
			}),
		).toThrow(InvalidIntrospectionDocumentError)
	})

	test("keeps the field-level detail for a malformed document", () => {
		expect(() => parseIntrospectionDocument({ ...INTROSPECTION_FIXTURE, hash: "nope" })).toThrow(/at hash/)
	})

	// A document declaring no version at all is malformed rather than written to another contract, so
	// the schema keeps it: there is no version to name, and nothing to upgrade towards.
	test("leaves a document with no version to the schema", () => {
		const { version: _version, ...versionless } = INTROSPECTION_FIXTURE
		expect(() => parseIntrospectionDocument(versionless)).toThrow(InvalidIntrospectionDocumentError)
		expect(() => parseIntrospectionDocument(versionless)).toThrow(/at version/)
	})
})
