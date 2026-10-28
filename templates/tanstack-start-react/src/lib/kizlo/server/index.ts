import { createKizlo } from "kizlo"
import { tanstackStart } from "kizlo/tanstack-start/react/server"
import { introspection } from "./generated"

export const { procedures, client, wordpress, handler } = createKizlo({ integrations: [tanstackStart()], introspection })
