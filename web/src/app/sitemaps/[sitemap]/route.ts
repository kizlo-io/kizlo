import { createSitemapRoute } from "kizlo/nextjs/server"
import { client } from "@/lib/kizlo/server"
import { docsSitemapEntry, docsSitemapUrls } from "@/lib/seo-docs"

// Unlike robots.txt, Vercel revalidates this route on demand, so it can stay static. It's
// served from the CDN at no per-request cost and still refreshes when content changes.
export const dynamic = "force-static"

export const GET = createSitemapRoute(client, {
	extra: [{ entry: docsSitemapEntry(), urls: (origin) => docsSitemapUrls(origin) }],
})
