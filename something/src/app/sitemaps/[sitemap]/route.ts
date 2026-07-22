import { createSitemapRoute } from "kizlo/nextjs/server"
import { client } from "@/lib/kizlo/server"

// Run on the edge: cheaper and faster than Node for a response this small.
export const runtime = "edge"

// Like robots.txt, Vercel bakes sitemap routes into immutable Edge CDN assets at build time,
// bypassing ISR and on-demand revalidatePath. The index gets frozen with whatever WordPress
// returned at build (often nothing, since the self-referential backend isn't reachable yet),
// and revalidation can't purge that CDN copy.
//
// force-dynamic opts out of that static treatment. createSitemapRoute caches the WordPress calls
// per sitemap and refreshes them on content changes (via revalidateTag), so requests stay cheap.
export const dynamic = "force-dynamic"

export const GET = createSitemapRoute(client)
