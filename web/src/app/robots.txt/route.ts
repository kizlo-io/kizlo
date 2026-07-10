import { createRobotsRoute } from "kizlo/nextjs/server"
import { client } from "@/lib/kizlo/server"

// Served as a route handler (not Next's `robots.ts` metadata convention) so
// `revalidatePath("/robots.txt")` can refresh it on content and settings changes.
export const dynamic = "force-static"

// A literal path with no dynamic segment prerenders at build into an immutable
// `revalidate: false` asset with no regeneration function, so on Vercel on-demand
// revalidation purges the edge cache but has nothing to regenerate against and the
// stale copy keeps serving until a redeploy (it only appears to work in dev). A
// numeric revalidate makes it ISR instead: it keeps CDN caching but attaches the
// regeneration lambda that `revalidatePath` fires. The webhook does the real-time
// refresh; this long interval is just a safety net. See vercel/next.js#60641.
export const revalidate = 86400

export const GET = createRobotsRoute(client)
