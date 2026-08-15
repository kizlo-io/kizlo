import { createProcedure } from "../shared/procedure"
import { ListSitemapUrlInput, Robots, Seo, type Sitemap, SitemapIndex, SitemapList, type SitemapUrl, SitemapUrlList } from "./schema"
import type { WPK_RobotRule, WPK_Sitemap, WPK_SitemapUrl, WPK_SitemapUrlImage } from "./types"
import { deserializeSeo } from "./utils"

/**
 * WordPress leaves `lastmod` null for a collection holding nothing, and an image found in the
 * content carries no title. Neither has anywhere to go in the sitemap XML, so both settle to the
 * empty string the public schema already promises.
 */
function deserializeSitemaps(sitemaps: WPK_Sitemap[]): Sitemap[] {
	return sitemaps.map((sitemap: WPK_Sitemap) => ({ ...sitemap, lastmod: sitemap.lastmod ?? "" }))
}

function deserializeSitemapUrls(urls: WPK_SitemapUrl[]): SitemapUrl[] {
	return urls.map((url: WPK_SitemapUrl) => ({
		...url,
		images: url.images.map((image: WPK_SitemapUrlImage) => ({ loc: image.loc, title: image.title ?? "" })),
	}))
}

export const SEO_ROUTER_MAP = {
	homepage: createProcedure(
		{
			scope: "internal",
			output: Seo,
		},
		async ({ context, errors }) => {
			const response = await context.wordpress.seo.homepage.retrieve()

			if (response.error) {
				context.logger.error("Get homepage seo unhandled error", response.error)
				throw errors.INTERNAL_SERVER_ERROR()
			}

			return deserializeSeo(response.data)
		},
	),

	sitemaps: {
		list: createProcedure(
			{
				scope: "internal",
				output: SitemapList,
			},
			async ({ context, errors }) => {
				const response = await context.wordpress.seo.sitemaps.list()

				if (response.error) {
					context.logger.error("List sitemaps unhandled error", response.error)
					throw errors.INTERNAL_SERVER_ERROR()
				}

				return deserializeSitemaps(response.data)
			},
		),

		index: createProcedure(
			{
				scope: "internal",
				output: SitemapIndex,
			},
			async ({ context, errors }) => {
				const response = await context.wordpress.seo.sitemaps.retrieve({ type: "index" })

				if (response.error) {
					context.logger.error("Get sitemap index unhandled error", response.error)
					throw errors.INTERNAL_SERVER_ERROR()
				}

				// The route serves the author collection too, which answers a list of URLs instead.
				if (Array.isArray(response.data)) {
					context.logger.error("Get sitemap index returned a collection page", undefined, { type: "index" })
					throw errors.INTERNAL_SERVER_ERROR()
				}

				return {
					origin: response.data.origin,
					sitemaps: deserializeSitemaps(response.data.sitemaps),
				}
			},
		),
	},

	robots: createProcedure(
		{
			scope: "internal",
			output: Robots,
		},
		async ({ context, errors }) => {
			const response = await context.wordpress.seo.robots.retrieve()

			if (response.error) {
				context.logger.error("List robots unhandled error", response.error)
				throw errors.INTERNAL_SERVER_ERROR()
			}

			return {
				sitemaps: response.data.sitemaps ?? [],
				rules: response.data.rules.map((item: WPK_RobotRule) => ({
					allow: item.allow,
					disallow: item.disallow,
					userAgent: item.user_agent,
				})),
			}
		},
	),

	urls: createProcedure(
		{
			scope: "internal",
			output: SitemapUrlList,
			input: ListSitemapUrlInput,
		},
		async ({ context, input, errors }) => {
			const page = input.page ?? 1

			// Authors are one collection with no key, so WordPress serves them off the keyless route.
			const response =
				input.type === "author"
					? await context.wordpress.seo.sitemaps.retrieve({ type: "author", page })
					: await context.wordpress.seo.sitemaps.list_urls({ type: input.type, key: input.key, page })

			if (response.error) {
				context.logger.error("List sitemap urls unhandled error", response.error)
				throw errors.INTERNAL_SERVER_ERROR()
			}

			// Only the index shares that route, and it is unreachable from here.
			if (!Array.isArray(response.data)) {
				context.logger.error("List sitemap urls returned the sitemap index", undefined, { type: input.type })
				throw errors.INTERNAL_SERVER_ERROR()
			}

			return deserializeSitemapUrls(response.data)
		},
	),
}
