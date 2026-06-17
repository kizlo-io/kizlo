import { createProcedure } from "../shared/procedure"
import { WP_KIZLO_BASE } from "../wordpress/constants"
import type { WP_CommonErrorCode } from "../wordpress/types"
import { ListSitemapUrlInput, Robots, SitemapList, SitemapUrlList } from "./schema"
import type { WPK_Robots, WPK_Sitemap, WPK_SitemapUrl } from "./types"

export const SEO_ROUTER_MAP = {
	sitemaps: createProcedure(
		{
			scope: "internal",
			output: SitemapList,
		},
		async ({ context, errors }) => {
			const response = await context.service.wordpress.get<WPK_Sitemap[], WP_CommonErrorCode>("/seo/sitemaps", {
				base: WP_KIZLO_BASE,
			})

			if (response.error) {
				context.logger.error("List sitemaps unhandled error", response.error)
				throw errors.INTERNAL_SERVER_ERROR()
			}

			return response.data
		},
	),

	robots: createProcedure(
		{
			scope: "internal",
			output: Robots,
		},
		async ({ context, errors }) => {
			const response = await context.service.wordpress.get<WPK_Robots, WP_CommonErrorCode>(`/seo/robots`, {
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
			const response = await context.service.wordpress.get<WPK_SitemapUrl[], WP_CommonErrorCode>(
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
