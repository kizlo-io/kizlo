import type { WP_EndpointData } from "../wordpress"

/** The resolved SEO block, exactly as the project's generated WordPress client describes it. */
export type WPK_Seo = WP_EndpointData<"kizlo.seo.homepage.retrieve">

export type WPK_Robots = WP_EndpointData<"kizlo.seo.robots.retrieve">

export type WPK_RobotRule = WPK_Robots["rules"][number]

export type WPK_Sitemap = WP_EndpointData<"kizlo.seo.sitemaps.list">[number]

export type WPK_SitemapUrl = WP_EndpointData<"kizlo.seo.sitemaps.listUrls">[number]

export type WPK_SitemapUrlImage = WPK_SitemapUrl["images"][number]
