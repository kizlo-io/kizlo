import { contactFormSeven } from "@kizlo/cf7"
import { woocommerce } from "@kizlo/woocommerce"
import { consoleLog, geoMock, Kizlo } from "kizlo"
import { z } from "zod"
import { testAuthAdapter } from "./auth"
import { captchaMock } from "./captcha"
import { getWpUrl, readTestCredentials } from "./env"

export function getTestServerInstance() {
	const creds = readTestCredentials()

	return new Kizlo({
		baseUrl: "http://test.local",
		siteSecret: "test-secret",
		environment: "test",
		credentials: {
			url: getWpUrl(),
			username: creds.users.admin.username,
			password: creds.users.admin.app_password,
		},
		extensions: [
			woocommerce(),
			contactFormSeven("contact", {
				id: creds.fixtures.cf7FormId,
				fields: z.object({
					"your-name": z.string().min(1),
					"your-email": z.email(),
					"your-message": z.string().min(1),
				}),
			}),
		],
		adapters: {
			geo: geoMock(),
			auth: testAuthAdapter,
			captcha: captchaMock(),
			logger: consoleLog({ levels: ["warn", "error"] }),
		},
	})
}

export type TestServerInstance = ReturnType<typeof getTestServerInstance>
