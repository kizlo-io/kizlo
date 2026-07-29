import { createSitemapRoute } from "kizlo/astro/server"
import { client } from "@/lib/kizlo/server"

export const GET = createSitemapRoute(client)
