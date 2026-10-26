import { getSecret } from "astro:env/server"
import { createKizlo } from "kizlo"
import { astro } from "kizlo/astro/server"
import { introspection } from "./generated"

export const { procedures, client, wordpress, handler } = createKizlo({ integrations: [astro({ env: getSecret })], introspection })
