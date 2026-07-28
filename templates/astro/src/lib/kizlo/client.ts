import { createKizloClient } from "kizlo/astro"
import { contract } from "./server/generated"

// Pass the public API URL at the call site so Vite inlines it into the browser bundle. Server-side
// it also resolves from PUBLIC_KIZLO_API_URL, so a client used during SSR works without the inline.
export const client = createKizloClient(contract, { url: import.meta.env.PUBLIC_KIZLO_API_URL })
