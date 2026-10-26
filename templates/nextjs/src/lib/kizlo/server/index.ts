import { createKizlo } from "kizlo"
import { nextjs } from "kizlo/nextjs/server"
import { introspection } from "./generated"

export const { procedures, client, wordpress, handler } = createKizlo({ integrations: [nextjs()], introspection })
