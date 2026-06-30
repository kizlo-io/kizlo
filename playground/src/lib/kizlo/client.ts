import { createKizloClient } from "kizlo/nextjs"
import { contract } from "./server/generated"

export const client = createKizloClient(contract)
