import { createRobotsRoute } from "kizlo/nextjs/server"
import { client } from "@/lib/kizlo/server"

export const dynamic = "force-dynamic"

export const GET = createRobotsRoute(client)
