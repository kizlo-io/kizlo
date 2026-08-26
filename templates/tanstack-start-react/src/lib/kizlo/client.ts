import { createKizloClient } from "kizlo/tanstack-start"
import { contract } from "./server/generated"

export const client = createKizloClient(contract, { url: import.meta.env.VITE_KIZLO_BASE_URL })
