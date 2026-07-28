import { createManifestRoute } from "kizlo/astro/server"
import { client } from "@/lib/kizlo/server"

// Web app manifest (name, icons, theme color) built from your WordPress brand settings. Rendered on
// demand so brand edits show up without a rebuild.
export const GET = createManifestRoute(client)
