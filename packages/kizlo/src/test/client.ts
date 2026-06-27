import { KizloClient } from "../client"
import { generateContract } from "../shared/contract"
import type { KizloTestInstance } from "./server"

/**
 * Wraps a test instance with the real browser client, routing its requests through the instance's `handler`. Use
 * it for end-to-end tests: calls go through serialization and the same scope rules as production (internal
 * procedures never leave the server), returning the `{ success, data, error }` envelope your frontend sees.
 */
export async function getKizloClientTestInstance(kizlo: KizloTestInstance) {
	const contract = await generateContract(kizlo.router)

	return new KizloClient({
		url: "http://test.local",
		fetch: (req) => kizlo.handler(req),
		contract: contract as unknown as KizloTestInstance["router"],
	})
}

export type KizloClientTestInstance = Awaited<ReturnType<typeof getKizloClientTestInstance>>
