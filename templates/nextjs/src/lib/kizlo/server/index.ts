import { createKizlo } from "kizlo"
import { nextjs } from "kizlo/nextjs/server"
import { introspection } from "./generated"

export const { procedures, client, context, handler } = createKizlo({ integrations: [nextjs()], introspection })
