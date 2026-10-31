import { toNextJsHandler } from "kizlo/nextjs/server"
import { handler } from "@/lib/kizlo/server"

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD } = toNextJsHandler(handler)
