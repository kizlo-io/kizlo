import { geoMock } from "../adapters/geo"
import { consoleLog } from "../adapters/logger"
import { getTestCredentials } from "../cli/wp/utils"
import { Kizlo } from "../kizlo"
import type { AnyExtension } from "../shared/extension"
import { testAuthAdapter } from "./auth"
import { captchaMock } from "./captcha"
import { toTestUser } from "./users"

/**
 * Wires a Kizlo instance against the seeded test stack: admin credentials read from
 * the test-credentials artifact, with mock geo, auth, and captcha adapters and a
 * warn/error logger. Call procedures directly through its `client` in integration tests.
 */
export function getKizloTestInstance<TExts extends readonly AnyExtension[] = []>(options?: { extensions?: TExts }) {
	const creds = getTestCredentials()

	return new Kizlo({
		baseUrl: "http://test.local",
		siteSecret: "test-secret",
		environment: "test",
		credentials: {
			url: creds.url,
			username: creds.users.admin.username,
			password: creds.users.admin.applicationPassword,
		},
		adapters: {
			geo: geoMock(),
			auth: testAuthAdapter(toTestUser(creds.users.user)),
			captcha: captchaMock(),
			logger: consoleLog({ levels: ["warn", "error"] }),
		},
		extensions: options?.extensions,
	})
}

export type KizloTestInstance = ReturnType<typeof getKizloTestInstance>
