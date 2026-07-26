import type { router } from ".."
import contractJson from "./contract.json"

export const contract = contractJson as unknown as typeof router
