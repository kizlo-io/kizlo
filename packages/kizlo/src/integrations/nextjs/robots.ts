import { unstable_cache } from "next/cache"
import type { S2SClient } from "../../kizlo"
import { renderRobotsBody } from "../../seo/robots"
import { textResponse } from "../../seo/utils"

export function createRobotsRoute(client: S2SClient<[]>) {
	return async function GET(_request: Request): Promise<Response> {
		return textResponse(await unstable_cache(() => renderRobotsBody(client), ["robots"])())
	}
}
