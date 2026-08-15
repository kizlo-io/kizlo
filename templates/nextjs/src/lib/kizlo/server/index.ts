import { createKizlo } from "kizlo/nextjs/server"
import { endpoints } from "./generated"

export const { router, client, context, handler } = createKizlo({ wordpress: { endpoints } })
