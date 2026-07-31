import { createFileRoute } from "@tanstack/react-router"
import { createApiHandlers } from "kizlo/tanstack-start/server"
import { handler } from "@/lib/kizlo/server"

// Kizlo's API, mounted at /api/kizlo. The browser client (src/lib/kizlo/client.ts) calls it over HTTP;
// every method forwards the raw request to Kizlo's handler, which dispatches internally.
export const Route = createFileRoute("/api/kizlo/$")({
	server: {
		handlers: createApiHandlers(handler),
	},
})
