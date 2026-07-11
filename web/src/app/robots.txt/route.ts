import { createRobotsRoute } from "kizlo/nextjs/server"
import { client } from "@/lib/kizlo/server"

export const runtime = "edge"

export const GET = createRobotsRoute(client)
