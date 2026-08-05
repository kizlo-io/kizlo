import { createFileRoute } from "@tanstack/solid-router"
import { createManifestRoute } from "kizlo/tanstack-start/server"
import { client } from "@/lib/kizlo/server"

export const Route = createFileRoute("/site.webmanifest")({
	server: {
		handlers: { GET: createManifestRoute(client) },
	},
})
