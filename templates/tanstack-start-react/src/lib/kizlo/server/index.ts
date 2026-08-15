import { createKizlo } from "kizlo/tanstack-start/server"
import { endpoints } from "./generated"

export const { router, client, context, handler } = createKizlo({ wordpress: { endpoints } })
