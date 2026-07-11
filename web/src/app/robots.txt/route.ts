import { createRobotsRoute } from "kizlo/nextjs/server"
import { client } from "@/lib/kizlo/server"

export const dynamic = "force-static"

export const GET = createRobotsRoute(client)
