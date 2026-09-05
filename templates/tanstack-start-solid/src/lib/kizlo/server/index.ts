import { createKizlo } from "kizlo"
import { tanstackStart } from "kizlo/tanstack-start/server"
import { introspection } from "./generated"

export const { procedures, client, context, handler } = createKizlo({ integrations: [tanstackStart()], introspection })
