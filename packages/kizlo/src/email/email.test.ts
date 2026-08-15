import { expect, test } from "vitest"
import { WP_Error } from "../wordpress"
import { EmailService } from "./service"

const PARAMS = { to: "reader@example.test", subject: "Order received", body: "<p>Thanks</p>" }

function service(result: unknown): EmailService {
	return new EmailService({ email: { send: async () => result } } as never)
}

test("a successful send resolves, rather than reading a flag WordPress never returns", async () => {
	const sent = service({ data: { to: [PARAMS.to], subject: PARAMS.subject }, status: 200, headers: new Headers(), error: null })

	await expect(sent.send(PARAMS)).resolves.toBeUndefined()
})

test("a failed send throws what WordPress answered", async () => {
	const error = new WP_Error({ code: "kizlo_email_failed", message: "wp_mail() failed." })
	const failed = service({ data: null, status: 500, headers: new Headers(), error })

	await expect(failed.send(PARAMS)).rejects.toBe(error)
})
