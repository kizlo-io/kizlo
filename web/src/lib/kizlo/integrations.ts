import { createIntegration, createProcedure, deserializeSeo, Seo } from "kizlo"
import z from "zod"
import type { WP_PostTypesIntegrationItem, WP_PostTypesIntegrationListItem } from "./server/generated/introspection"

// The catalog is editable WordPress content (the `integration` CPT), so `kizlo generate` only exposes
// the raw `postTypes.integration` endpoints. This resource is the friendly `client.integrations` the
// pages call: a read-only projection of each entry into the small shape the catalog needs, hiding the
// full WordPress record.

export const IntegrationType = z.enum(["package", "plugin", "both"])
export type IntegrationType = z.infer<typeof IntegrationType>

export const IntegrationCategory = z.object({
	name: z.string(),
	slug: z.string(),
})

export const Integration = z.object({
	id: z.number(),
	name: z.string(),
	slug: z.string(),
	/** Plain text, for cards and meta descriptions. */
	description: z.string(),
	/** The editor's rendered HTML, for the detail page body. */
	content: z.string(),
	logoUrl: z.string().nullable(),
	logoAlt: z.string().nullable(),
	type: IntegrationType.nullable(),
	categories: z.array(IntegrationCategory),
	npmPackage: z.string().nullable(),
	pluginSlug: z.string().nullable(),
	docsUrl: z.string().nullable(),
	/** Null on list entries; WordPress only resolves the SEO block on a single fetch. */
	seo: Seo.nullable(),
})
export type Integration = z.infer<typeof Integration>

/** Empty string is how an unset Kizlo custom field comes back; treat it as absent. */
function nullifyEmpty(value: string): string | null {
	const trimmed = value.trim()
	return trimmed.length > 0 ? trimmed : null
}

/** Rendered WordPress content is short HTML here; flatten it to the plain text a card/overview shows. */
function toPlainText(html: string): string {
	return html
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&#0?39;|&apos;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/\s+/g, " ")
		.trim()
}

function mapType(type: WP_PostTypesIntegrationItem["kizlo"]["custom"]["type"]): IntegrationType | null {
	return type === "package" || type === "plugin" || type === "both" ? type : null
}

/** The list and single endpoints share the fields this projection reads. */
function mapIntegration(entry: WP_PostTypesIntegrationListItem | WP_PostTypesIntegrationItem): Integration {
	const custom = entry.kizlo.custom
	return {
		id: entry.id,
		name: toPlainText(entry.title.rendered),
		slug: entry.slug,
		description: toPlainText(entry.content.rendered),
		content: entry.content.rendered,
		logoUrl: entry.kizlo.custom.logo?.src ?? null,
		logoAlt: entry.kizlo.custom.logo?.alt ?? null,
		type: mapType(custom.type),
		categories: (entry.kizlo.categories ?? []).map((category) => ({ name: category.name, slug: category.slug })),
		npmPackage: nullifyEmpty(custom.npm_package),
		pluginSlug: nullifyEmpty(custom.plugin_slug),
		docsUrl: nullifyEmpty(custom.docs_url),
		seo: "seo" in entry.kizlo ? deserializeSeo(entry.kizlo.seo) : null,
	}
}

export const integrations = createIntegration({
	id: "integrations",
	procedures: {
		list: createProcedure(
			{
				scope: "api",
				method: "GET",
				path: "/integrations",
				output: z.array(Integration),
				errors: { INTEGRATIONS_UNAVAILABLE: { status: 502, message: "The integrations catalog is unavailable." } },
			},
			async ({ context, errors }) => {
				const response = await context.wordpress.postTypes.integration.list({
					status: ["publish"],
					per_page: 100,
					orderby: "title",
					order: "asc",
				})
				if (response.error) {
					context.logger.error("List integrations failed", response.error, { code: response.error.code })
					throw errors.INTEGRATIONS_UNAVAILABLE()
				}
				return response.data.map(mapIntegration)
			},
		),

		get: createProcedure(
			{
				scope: "api",
				method: "GET",
				path: "/integrations/{identifier}",
				params: z.object({ identifier: z.string() }),
				output: Integration.nullable(),
				errors: { INTEGRATIONS_UNAVAILABLE: { status: 502, message: "The integrations catalog is unavailable." } },
			},
			async ({ input, context, errors }) => {
				const response = await context.wordpress.postTypes.integration.retrieve({ identifier: input.params.identifier })
				if (response.error) {
					switch (response.error.code) {
						case "invalid_post_type":
						case "post_type_not_found":
						case "rest_post_invalid_id":
							return null
						default:
							context.logger.error("Get integration failed", response.error, {
								identifier: input.params.identifier,
								code: response.error.code,
							})
							throw errors.INTEGRATIONS_UNAVAILABLE()
					}
				}
				if (response.data.status !== "publish") return null
				return mapIntegration(response.data)
			},
		),
	},
})
