import { createSitemapRedirectRoute } from "kizlo/astro/server"

// Crawlers probe the well-known /sitemap.xml; this permanently redirects (308) to the generated
// index at /sitemaps/index.xml.
export const GET = createSitemapRedirectRoute()
