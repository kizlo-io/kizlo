import { createRobotsRoute } from "kizlo/nextjs/server"
import { client } from "@/lib/kizlo/server"

// Run on the edge: cheaper and faster than Node for a response this small.
export const runtime = "edge"

// Vercel treats special metadata files like robots.txt and sitemap.xml as completely static
// files at build time, bypassing normal Incremental Static Regeneration (ISR) and on-demand
// revalidatePath rules.
//
// While your revalidation logic executes perfectly in a local Node.js server, Vercel uploads
// these routes directly to its Edge CDN as immutable assets. Subsequent on-demand revalidation
// triggers will successfully clear the Data Cache but fail to purge the CDN-level Edge cache
// for that file.
//
// force-dynamic opts out of that static treatment so CMS edits show up; the WordPress call is
// cached, so requests stay cheap.
export const dynamic = "force-dynamic"

export const GET = createRobotsRoute(client)
