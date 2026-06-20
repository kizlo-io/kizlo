import { KizloClient } from "../client"
import { generateContract } from "../shared/contract"
import type { KizloTestInstance } from "./server"

export async function getKizloClientTestInstance(kizlo: KizloTestInstance) {
	const contract = await generateContract(kizlo.router)

	return new KizloClient({
		url: "http://test.local",
		fetch: (req) => kizlo.handler(req),
		contract: contract as unknown as KizloTestInstance["router"],
	})
}

export type KizloClientTestInstance = Awaited<ReturnType<typeof getKizloClientTestInstance>>
