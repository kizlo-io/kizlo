import { createFileRoute } from "@tanstack/solid-router"
import { createSitemapRoute } from "kizlo/tanstack-start/server"
import { client } from "@/lib/kizlo/server"

// Splat route so /sitemaps/index.xml and every /sitemaps/{key}.xml page resolve to one handler. It reads
// the slug from the request URL, so no params plumbing is needed.
export const Route = createFileRoute("/sitemaps/$")({
	server: {
		handlers: { GET: createSitemapRoute(client) },
	},
})
