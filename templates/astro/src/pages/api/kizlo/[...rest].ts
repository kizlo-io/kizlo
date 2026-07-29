import type { APIRoute } from "astro"
import { handler } from "@/lib/kizlo/server"

export const ALL: APIRoute = ({ request }) => handler(request)
