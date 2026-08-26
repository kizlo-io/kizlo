import { Kizlo } from "kizlo"
import { expect, test } from "vitest"
import { z } from "zod"
import { contactFormSeven } from "./index"

function server(endpoints: object) {
	return () =>
		new Kizlo({
			baseUrl: "https://app.example",
			siteSecret: "site-secret",
			credentials: { url: "https://wp.example", username: "admin", password: "secret" },
			integrations: [contactFormSeven("contact", { id: 42, fields: z.object({ email: z.string() }) })],
			wordpressEndpoints: endpoints,
		})
}

test("refuses to start against a WordPress that does not serve the CF7 route", () => {
	expect(server({})).toThrow(/cf7\.forms\.submit/)
	expect(server({})).toThrow(/kizlo-cf7 0\.2\.0\+/)
})

test("starts when the generated client contains the CF7 route", () => {
	expect(server({ cf7: { forms: { submit: {} } } })).not.toThrow()
})
