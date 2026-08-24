import { KizloClient } from "../client"
import type { Kizlo } from "../kizlo"
import { generateContract } from "../shared/contract"
import type { AnyExtension } from "../shared/extension"

/**
 * Wraps a test instance with the real browser client, routing its requests through the instance's `handler`. Use
 * it for end-to-end tests: calls go through serialization and the same scope rules as production (internal
 * procedures never leave the server), returning the `{ success, data, error }` envelope your frontend sees.
 */
export async function getKizloClientTestInstance<TExts extends readonly AnyExtension[]>(
	kizlo: Kizlo<TExts>,
	options?: { fetch?: (request: Request) => Promise<Response>; url?: string },
) {
	const contract = await generateContract(kizlo.router)

	return new KizloClient({
		url: options?.url ?? "http://test.local",
		fetch: options?.fetch ?? ((req) => kizlo.handler(req)),
		contract: contract as unknown as Kizlo<TExts>["router"],
	})
}

export type KizloClientTestInstance = Awaited<ReturnType<typeof getKizloClientTestInstance>>
