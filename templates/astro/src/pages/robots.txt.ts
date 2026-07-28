import { createRobotsRoute } from "kizlo/astro/server"
import { client } from "@/lib/kizlo/server"

// robots.txt built from your WordPress crawling settings. Under `output: "server"` this renders on
// demand, so edits in wp-admin show up without a rebuild.
export const GET = createRobotsRoute(client)
