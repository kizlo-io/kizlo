import { createFileRoute } from "@tanstack/react-router"
import { createSitemapRedirectRoute } from "kizlo/tanstack-start/server"

// 308-redirects the well-known /sitemap.xml to the generated index at /sitemaps/index.xml.
export const Route = createFileRoute("/sitemap.xml")({
	server: {
		handlers: { GET: createSitemapRedirectRoute() },
	},
})
