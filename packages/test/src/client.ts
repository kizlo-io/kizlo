import { generateContract, KizloClient } from "kizlo"
import type { TestServerInstance } from "./server"

export async function getTestClientInstance(kizlo: TestServerInstance) {
	const contract = await generateContract(kizlo.router)

	return new KizloClient({
		url: "http://test.local",
		fetch: (req) => kizlo.handler(req),
		contract: contract as unknown as TestServerInstance["router"],
	})
}

export type TestClientInstance = Awaited<ReturnType<typeof getTestClientInstance>>
