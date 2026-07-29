import { createKizloClient } from "kizlo/astro"
import { contract } from "./server/generated"

export const client = createKizloClient(contract, { url: import.meta.env.PUBLIC_KIZLO_API_URL })
