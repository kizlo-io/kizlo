import { endpoints } from "../../../../introspection"
import { geoMock } from "../adapters/geo"
import { consoleLog } from "../adapters/logger"
import type { ServiceAdapters } from "../adapters/types"
import { getTestCredentials } from "../cli/wp/utils"
import { Kizlo } from "../kizlo"
import { type AnyIntegration, createIntegration } from "../shared/integration"
import { testAuthAdapter } from "./auth"
import { captchaMock } from "./captcha"
import { toTestUser } from "./users"

/**
 * Wires a Kizlo instance against the seeded test stack: admin credentials read from
 * the test-credentials artifact, with mock geo, auth, and captcha adapters and a
 * warn/error logger. Call procedures directly through its `client` in integration tests.
 */
export function getKizloTestInstance<TIntegrations extends readonly AnyIntegration[] = []>(options?: {
	adapters?: Partial<ServiceAdapters>
	baseUrl?: string
	integrations?: TIntegrations
}) {
	const creds = getTestCredentials()
	const testRuntime = createIntegration({
		id: "kizlo-test",
		adapters: {
			geo: geoMock(),
			auth: testAuthAdapter(toTestUser(creds.users.user)),
			captcha: captchaMock(),
			logger: consoleLog({ levels: ["warn", "error"] }),
			...options?.adapters,
		},
	})

	return new Kizlo<TIntegrations>({
		baseUrl: options?.baseUrl ?? "http://test.local",
		siteSecret: "test-secret",
		credentials: {
			url: creds.url,
			username: creds.users.admin.username,
			password: creds.users.admin.applicationPassword,
		},
		wordpressEndpoints: endpoints,
		integrations: [testRuntime, ...(options?.integrations ?? [])] as unknown as TIntegrations,
	})
}

export type KizloTestInstance = ReturnType<typeof getKizloTestInstance>
