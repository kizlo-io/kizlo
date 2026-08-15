import { describe, expect, test } from "vitest"
import { InvalidIntrospectionDocumentError, parseIntrospectionDocument } from "./introspection"
import { INTROSPECTION_FIXTURE } from "./introspection.fixture"

describe("parseIntrospectionDocument", () => {
	test("accepts the supported contract", () => {
		expect(parseIntrospectionDocument(INTROSPECTION_FIXTURE)).toEqual(INTROSPECTION_FIXTURE)
	})

	test("rejects unsupported versions and malformed operations", () => {
		expect(() => parseIntrospectionDocument({ ...INTROSPECTION_FIXTURE, version: "2.0" })).toThrow(InvalidIntrospectionDocumentError)
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
})
