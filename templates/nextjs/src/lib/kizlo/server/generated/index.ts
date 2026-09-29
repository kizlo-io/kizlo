import type { procedures } from ".."
import contractJson from "./contract.json"

export const contract = contractJson

declare module "kizlo" {
	interface KizloProcedureRegistry {
		procedures: typeof procedures
	}
}

export { introspection, type WordPressClient } from "./introspection"
