import { createManifestRoute } from "kizlo/nextjs/server"
import { client } from "@/lib/kizlo/server"

// Run on the edge: cheaper and faster than Node for a response this small.
export const runtime = "edge"

// Like robots.txt, Vercel bakes this route into an immutable Edge CDN asset at build time,
// bypassing ISR and on-demand revalidatePath. force-dynamic opts out of that static treatment
// so brand-settings edits show up; createManifestRoute caches the WordPress call, so requests
// stay cheap.
export const dynamic = "force-dynamic"

export const GET = createManifestRoute(client)
