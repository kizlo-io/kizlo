import { deserializeSeo, requireData, Seo } from "kizlo"
import z from "zod"
import { client } from "./client"
import type { WP_KizloContentIntegration } from "./generated/introspection.browser"

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

function mapType(type: NonNullable<WP_KizloContentIntegration["kizlo"]>["custom"]["type"]): IntegrationType | null {
	return type === "package" || type === "plugin" || type === "both" ? type : null
}

/** The list and single endpoints share the fields this projection reads. */
function mapIntegration(entry: WP_KizloContentIntegration): Integration | null {
	if (!entry.kizlo) return null
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

export async function listIntegrations(): Promise<Integration[]> {
	const entries = requireData(await client.kizlo.content.integration.list({ query: { per_page: 100, orderby: "title", order: "asc" } }))
	return entries.map(mapIntegration).filter((entry): entry is Integration => entry !== null)
}

export async function getIntegration(identifier: string): Promise<Integration | null> {
	const result = await client.kizlo.content.integration.retrieve({ params: { identifier } })
	if (result.error) {
		if (result.status === 404) return null
		throw result.error
	}
	return mapIntegration(result.data)
}
