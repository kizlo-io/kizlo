import type { IntrospectionDocument } from "./introspection"

export const INTROSPECTION_FIXTURE: IntrospectionDocument = {
	version: "1.1",
	hash: `sha256:${"a".repeat(64)}`,
	schemas: {
		"kizlo.error": {
			type: "object",
			properties: {
				code: { type: "string", required: true },
				message: { type: "string", required: true },
				data: { type: "object" },
			},
		},
		"acme.entity": {
			type: "object",
			description: "A shared entity.",
			properties: {
				id: { type: "integer", required: true },
				label: { type: "string", nullable: true, description: "Display label." },
			},
		},
		"acme.book": {
			type: "object",
			$extends: "acme.entity",
			properties: {
				status: { type: "string", enum: ["draft", "publish"], required: true },
				tags: { type: "array", items: { type: "string" } },
				author: {
					type: "object",
					$extends: "acme.entity",
					properties: { biography: { type: "string" } },
				},
				metadata: {
					type: "object",
					additionalProperties: { anyOf: [{ type: "string" }, { type: "number" }] },
				},
				publication: {
					type: "object",
					properties: {
						imprint: {
							type: "object",
							properties: { name: { type: "string", required: true } },
						},
					},
				},
			},
		},
		"acme.dictionary": {
			type: "object",
			properties: {
				known: { type: "boolean", deprecated: true },
			},
			patternProperties: { "^count_": { type: "integer" } },
			additionalProperties: { type: "number" },
		},
		"acme.audit": {
			type: "object",
			properties: { created_by: { type: "string", required: true } },
		},
		"acme.maybe-book": {
			type: "object",
			$extends: ["acme.book", "acme.audit"],
			nullable: true,
			properties: { attachment: { type: "file" } },
		},
		"acme.choice": {
			oneOf: [{ $ref: "acme.book" }, { type: "string", nullable: true }],
		},
		"post-types.book.create-input": {
			type: "object",
			description: "Fields accepted when creating a book.",
			properties: { title: { type: "string", required: true } },
		},
		"post-types.book.item": {
			type: "object",
			properties: {
				kizlo: {
					type: "object",
					required: true,
					properties: {
						custom: {
							type: "object",
							required: true,
							properties: { isbn: { type: "string", required: true } },
						},
					},
				},
			},
		},
		"taxonomies.genre.item": {
			type: "object",
			properties: {
				kizlo: {
					type: "object",
					required: true,
					properties: {
						custom: {
							type: "object",
							required: true,
							properties: { shelf: { type: "integer", required: true } },
						},
					},
				},
			},
		},
	},
	apis: {
		"post-types.book": {
			namespace: "kizlo/v1",
			paths: {
				"/post-types/book": {
					list: {
						method: "GET",
						summary: "List books",
						errors: ["rest_forbidden"],
						input: {
							query: {
								type: "object",
								properties: {
									page: { type: "integer" },
									status: { type: "string", enum: ["draft", "publish"] },
								},
							},
						},
						responses: {
							"200": {
								content_type: "application/json",
								headers: {
									type: "object",
									properties: { "X-WP-Total": { type: "integer", required: true } },
								},
								body: { type: "array", items: { $ref: "acme.book" } },
							},
							"400": { content_type: "application/json", body: { $ref: "kizlo.error" } },
						},
					},
					create: {
						method: "POST",
						errors: ["invalid_book"],
						input: {
							body: {
								type: "object",
								content_type: "application/json",
								$extends: "post-types.book.create-input",
							},
						},
						responses: {
							"201": { content_type: "application/json", body: { $ref: "acme.book" } },
							"400": { content_type: "application/json", body: { $ref: "kizlo.error" } },
						},
					},
				},
				"/post-types/book/{identifier}": {
					retrieve: {
						method: "GET",
						description: "Retrieve one book.",
						errors: ["rest_not_found"],
						input: {
							params: {
								type: "object",
								properties: { identifier: { type: "string", required: true } },
							},
						},
						responses: {
							"200": { content_type: "application/json", body: { $ref: "acme.book" } },
							"404": { content_type: "application/json", body: { $ref: "kizlo.error" } },
						},
					},
					restore_revision: {
						method: "POST",
						summary: "Restore a book to one of its revisions",
						errors: ["rest_not_found"],
						input: {
							params: {
								type: "object",
								properties: { identifier: { type: "string", required: true } },
							},
							// A body method that also takes a query parameter, which the old method-based split could not say.
							query: {
								type: "object",
								properties: { context: { type: "string", enum: ["view", "edit"] } },
							},
							body: {
								type: "object",
								content_type: "application/json",
								properties: { revision: { type: "integer", required: true } },
							},
						},
						responses: {
							"200": { content_type: "application/json", body: { $ref: "acme.book" } },
							"404": { content_type: "application/json", body: { $ref: "kizlo.error" } },
						},
					},
				},
			},
		},
		"shipping.zone-locations": {
			namespace: "wc/v3",
			paths: {
				"/shipping/zones/{zone_id}/locations": {
					update: {
						method: "PUT",
						summary: "Replace every location in a shipping zone",
						errors: ["woocommerce_rest_shipping_zone_invalid"],
						input: {
							params: {
								type: "object",
								properties: { zone_id: { type: "integer", required: true } },
							},
							body: {
								type: "array",
								content_type: "application/json",
								items: {
									type: "object",
									properties: {
										code: { type: "string", required: true },
										type: { type: "string", enum: ["country", "state", "postcode", "continent"] },
									},
								},
							},
						},
						responses: {
							"200": {
								content_type: "application/json",
								body: { type: "array", items: { type: "object", properties: { code: { type: "string", required: true } } } },
							},
							"404": { content_type: "application/json", body: { $ref: "kizlo.error" } },
						},
					},
				},
			},
		},
	},
	diagnostics: [{ type: "warning", message: "A harmless fixture warning.", data: { schema_id: "acme.book" } }],
}
