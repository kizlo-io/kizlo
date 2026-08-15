import { getSecret } from "astro:env/server"
import { createKizlo } from "kizlo/astro/server"
import { endpoints } from "./generated"

export const { router, client, context, handler } = createKizlo({ getSecret, wordpress: { endpoints } })
