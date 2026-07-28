import type { APIRoute } from "astro"
import { handler } from "@/lib/kizlo/server"

// Mounts the Kizlo request handler at /api/kizlo/*. `ALL` forwards every HTTP method to the handler,
// which routes to your procedures. Cookies flow through the standard Request/Response headers.
export const ALL: APIRoute = ({ request }) => handler(request)
