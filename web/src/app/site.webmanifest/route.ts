import { createManifestRoute } from "kizlo/nextjs/server"
import { client } from "@/lib/kizlo/server"

// Run on the edge: cheaper and faster than Node for a response this small.
export const runtime = "edge"

// See robots.txt/route.ts: opt out of Vercel's static treatment so brand-settings
// edits show up. The underlying WordPress call is cached, so requests stay cheap.
export const dynamic = "force-dynamic"

export const GET = createManifestRoute(client)
