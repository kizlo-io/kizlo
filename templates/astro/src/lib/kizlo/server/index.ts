import { getSecret } from "astro:env/server"
import { createKizlo } from "kizlo"
import { astro } from "kizlo/astro/server"
import { endpoints } from "./generated"

export const { procedures, client, context, handler } = createKizlo({ integrations: [astro({ env: getSecret })], wordpress: { endpoints } })
