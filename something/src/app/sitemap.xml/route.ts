import { createSitemapRedirectRoute } from "kizlo/nextjs/server"

// Many crawlers ignore robots.txt and probe the well-known /sitemap.xml directly. This route
// permanently redirects (308) to the generated index at /sitemaps/index.xml. The response is a
// fixed constant with no WordPress call or request input, so Next statically generates it at
// build time (no runtime/edge function invoked per request).
export const GET = createSitemapRedirectRoute()
