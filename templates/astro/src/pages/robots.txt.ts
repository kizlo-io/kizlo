import { createRobotsRoute } from "kizlo/astro/server"
import { client } from "@/lib/kizlo/server"

export const GET = createRobotsRoute(client)
