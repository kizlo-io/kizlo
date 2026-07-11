import type { S2SClient } from "../../kizlo"
import { createRobotsRoute as createCoreRobotsRoute } from "../../seo/robots"

export function createRobotsRoute(client: S2SClient<[]>) {
	return createCoreRobotsRoute(client)
}
