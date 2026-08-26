import { createKizlo } from "kizlo"
import { nextjs } from "kizlo/nextjs/server"
import { endpoints } from "./generated"

export const { procedures, client, context, handler } = createKizlo({ integrations: [nextjs()], wordpress: { endpoints } })
