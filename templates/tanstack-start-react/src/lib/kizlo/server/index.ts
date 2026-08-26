import { createKizlo } from "kizlo"
import { tanstackStart } from "kizlo/tanstack-start/server"
import { endpoints } from "./generated"

export const { procedures, client, context, handler } = createKizlo({ integrations: [tanstackStart()], wordpress: { endpoints } })
