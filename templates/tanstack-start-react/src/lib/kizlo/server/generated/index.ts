import type { procedures } from ".."
import contractJson from "./contract.json"

export const contract = contractJson as unknown as typeof procedures
export { endpoints, type WordPressClient } from "./introspection"
