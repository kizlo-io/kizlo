import { createRobotsRoute } from "kizlo/nextjs/server"
import { client } from "@/lib/kizlo/server"

// Served as a route handler (not Next's `robots.ts` metadata convention) so
// `revalidatePath("/robots.txt")` can refresh it on content and settings changes.
export const dynamic = "force-static"

export const GET = createRobotsRoute(client)
