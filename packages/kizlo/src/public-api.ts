import type { WP_Client, WP_Endpoint, WP_EndpointInput, WP_EndpointPath, WP_EndpointResult } from "./wordpress/types"

type Endpoint<Path extends WP_EndpointPath> = WP_Client<{
	operation: WP_Endpoint<WP_EndpointInput<Path>, WP_EndpointResult<Path>>
}>["operation"]

/** The public operations used by framework metadata, manifest, robots and sitemap helpers. */
export interface PublicApiClient {
	kizlo: {
		site: { retrieve: Endpoint<"kizlo.site.retrieve"> }
		seo: {
			homepage: { retrieve: Endpoint<"kizlo.seo.homepage.retrieve"> }
			robots: { retrieve: Endpoint<"kizlo.seo.robots.retrieve"> }
			sitemaps: {
				list: Endpoint<"kizlo.seo.sitemaps.list">
				retrieve: Endpoint<"kizlo.seo.sitemaps.retrieve">
				listUrls: Endpoint<"kizlo.seo.sitemaps.listUrls">
			}
		}
	}
}
