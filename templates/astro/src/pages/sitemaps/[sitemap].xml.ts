import { createSitemapRoute } from "kizlo/astro/server"
import { client } from "@/lib/kizlo/server"

// Serves the sitemap index (/sitemaps/index.xml) and every collection page (/sitemaps/{key}.xml),
// built from WordPress. Rendered on demand so new content appears without a rebuild.
export const GET = createSitemapRoute(client)
