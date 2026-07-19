import { createProcedure } from "../shared/procedure"
import type { WP_CommonErrorCode } from "../wordpress"
import { WP_KIZLO_BASE } from "../wordpress"
import { ListSitemapUrlInput, Robots, Seo, SitemapIndex, SitemapList, SitemapUrlList } from "./schema"
import type { WPK_Robots, WPK_Seo, WPK_Sitemap, WPK_SitemapIndex, WPK_SitemapUrl } from "./types"
import { deserializeSeo } from "./utils"

export const SEO_ROUTER_MAP = {
	homepage: createProcedure(
		{
			scope: "internal",
			output: Seo,
		},
		async ({ context, errors }) => {
			const response = await context.wordpress.get<WPK_Seo, WP_CommonErrorCode>("/seo/homepage", {
				base: WP_KIZLO_BASE,
			})

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
				const response = await context.wordpress.get<WPK_Sitemap[], WP_CommonErrorCode>("/seo/sitemaps", {
					base: WP_KIZLO_BASE,
				})

				if (response.error) {
					context.logger.error("List sitemaps unhandled error", response.error)
					throw errors.INTERNAL_SERVER_ERROR()
				}

				return response.data
			},
		),

		index: createProcedure(
			{
				scope: "internal",
				output: SitemapIndex,
			},
			async ({ context, errors }) => {
				const response = await context.wordpress.get<WPK_SitemapIndex, WP_CommonErrorCode>("/seo/sitemaps/index", {
					base: WP_KIZLO_BASE,
				})

				if (response.error) {
					context.logger.error("Get sitemap index unhandled error", response.error)
					throw errors.INTERNAL_SERVER_ERROR()
				}

				return {
					origin: response.data.origin,
					sitemaps: response.data.sitemaps,
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
			const response = await context.wordpress.get<WPK_Robots, WP_CommonErrorCode>(`/seo/robots`, {
				base: WP_KIZLO_BASE,
			})
			if (response.error) {
				context.logger.error("List robots unhandled error", response.error)
				throw errors.INTERNAL_SERVER_ERROR()
			}

			return {
				sitemaps: response.data.sitemaps ?? [],
				rules: response.data.rules.map((item) => ({
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
			const response = await context.wordpress.get<WPK_SitemapUrl[], WP_CommonErrorCode>(
				`/seo/sitemaps/${input.type}/${input.type !== "author" ? input.key : ""}`,
				{
					base: WP_KIZLO_BASE,
					searchParams: { page: input.page ?? 1 },
				},
			)
			if (response.error) {
				context.logger.error("List sitemap urls unhandled error", response.error)
				throw errors.INTERNAL_SERVER_ERROR()
			}
			return response.data
		},
	),
}
