import { createSitemapRoute } from "kizlo/nextjs/server"
import { client } from "@/lib/kizlo/server"
import { docsSitemapEntry, docsSitemapUrls } from "@/lib/seo-docs"

export const GET = createSitemapRoute(client, {
	extra: [{ entry: docsSitemapEntry(), urls: (origin) => docsSitemapUrls(origin) }],
})
