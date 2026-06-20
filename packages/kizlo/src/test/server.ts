import { geoMock } from "../adapters/geo"
import { consoleLog } from "../adapters/logger"
import { getTestCredentials } from "../cli/wp/utils"
import { Kizlo } from "../kizlo"
import type { AnyExtension } from "../shared/extension"
import { testAuthAdapter } from "./auth"
import { captchaMock } from "./captcha"
import { toTestUser } from "./users"

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
