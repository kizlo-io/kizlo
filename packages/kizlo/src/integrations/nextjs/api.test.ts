import { expect, test, vi } from "vitest"
import { Kizlo } from "../../kizlo"
import { createIntegration } from "../../shared/integration"
import { createProcedure, schemaType } from "../../shared/procedure"
import { testRequestContext } from "../../test/request-context.test-helper"
import { toNextJsHandler } from "./api"

test.each(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"] as const)(
	"forwards %s requests unchanged and ignores Next.js route context",
	async (method) => {
		const request = new Request("https://app.example/api/kizlo/example?keep=1", {
			method,
			...(["POST", "PUT", "PATCH", "DELETE"].includes(method) ? { body: "original input" } : {}),
		})
		const response = new Response("streamed output", { status: 202, headers: { "Set-Cookie": "session=value; HttpOnly" } })
		const handler = vi.fn((_request: Request) => response)
		const route: (request: Request, context: { params: Promise<{ rest: string[] }> }) => Response | Promise<Response> =
			toNextJsHandler(handler)[method]
		expect(await route(request, { params: Promise.resolve({ rest: ["example"] }) })).toBe(response)
		expect(handler).toHaveBeenCalledExactlyOnceWith(request)
		expect(request.bodyUsed).toBe(false)
		expect(response.bodyUsed).toBe(false)
		expect(response.headers.getSetCookie()).toEqual(["session=value; HttpOnly"])
		expect(await response.text()).toBe("streamed output")
	},
)

test("preserves asynchronous responses and errors", async () => {
	const request = new Request("https://app.example/api/kizlo")
	const response = new Response(null)
	expect(await toNextJsHandler(async () => response).GET(request)).toBe(response)
	const error = new Error("failed")
	await expect(
		toNextJsHandler(async () => {
			throw error
		}).GET(request),
	).rejects.toBe(error)
})

test("keeps application-owned runtime context when adapting the actual Kizlo handler", async () => {
	const scope = testRequestContext()
	const server = new Kizlo({
		baseUrl: "https://app.example/api/kizlo",
		siteSecret: "secret",
		credentials: { url: "https://wp.example", username: "a", password: "b" },
		integrations: [
			createIntegration({ id: "test-runtime", adapters: { requestContext: scope } }),
			createIntegration({
				id: "probe",
				procedures: {
					info: createProcedure(
						{ scope: "api", method: "GET", path: "/info", output: schemaType<{ site: string; native: boolean }>() },
						async ({ context }) => {
							const values = context as typeof context & { env: { SITE: string }; executionCtx: object }
							return { site: values.env.SITE, native: !!values.executionCtx }
						},
					),
				},
			}),
		],
	})
	const { GET } = toNextJsHandler(server.handler)

	const request = new Request("https://app.example/api/kizlo/info")
	const env = { SITE: "shop" }
	const executionCtx = { waitUntil: vi.fn() }
	const response = await scope.run(request, { env, executionCtx }, async () => GET(request))
	expect(response.status).toBe(200)
	expect(await response.json()).toEqual({ site: env.SITE, native: true })
})
