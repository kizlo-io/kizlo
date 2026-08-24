import { endpoints } from "../../../../wordpress"
import { geoMock } from "../adapters/geo"
import { consoleLog } from "../adapters/logger"
import { getTestCredentials } from "../cli/wp/utils"
import { Kizlo, type ServiceAdapters } from "../kizlo"
import type { AnyExtension } from "../shared/extension"
import { testAuthAdapter } from "./auth"
import { captchaMock } from "./captcha"
import { toTestUser } from "./users"

/**
 * Wires a Kizlo instance against the seeded test stack: admin credentials read from
 * the test-credentials artifact, with mock geo, auth, and captcha adapters and a
 * warn/error logger. Call procedures directly through its `client` in integration tests.
 */
export function getKizloTestInstance<TExts extends readonly AnyExtension[] = []>(options?: {
	adapters?: Partial<ServiceAdapters>
	baseUrl?: string
	extensions?: TExts
}) {
	const creds = getTestCredentials()

	return new Kizlo({
		baseUrl: options?.baseUrl ?? "http://test.local",
		siteSecret: "test-secret",
		environment: "test",
		connect: "remote",
		credentials: {
			url: creds.url,
			username: creds.users.admin.username,
			password: creds.users.admin.applicationPassword,
		},
		wordpressEndpoints: endpoints,
		adapters: {
			geo: geoMock(),
			auth: testAuthAdapter(toTestUser(creds.users.user)),
			captcha: captchaMock(),
			logger: consoleLog({ levels: ["warn", "error"] }),
			...options?.adapters,
		},
		extensions: options?.extensions,
	})
}

export type KizloTestInstance = ReturnType<typeof getKizloTestInstance>
