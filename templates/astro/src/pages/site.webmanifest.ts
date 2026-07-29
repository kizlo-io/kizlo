import { createManifestRoute } from "kizlo/astro/server"
import { client } from "@/lib/kizlo/server"

export const GET = createManifestRoute(client)
