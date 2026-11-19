import { afterEach, expect, test, vi } from "vitest"
import { Kizlo } from "./kizlo"
import { createIntegration } from "./shared/integration"
import { createMiddleware } from "./shared/middleware"
import { createProcedure, schemaType } from "./shared/procedure"
import { getKizloClientTestInstance } from "./test/client"

const credentials = { url: "https://wp.example", username: "admin", password: "secret" }

afterEach(() => vi.unstubAllGlobals())

test.each(["api", "remote"] as const)("browser %s calls forward cancellation for both call styles", async (scope) => {
	const procedure =
		scope === "api"
			? createProcedure({ scope: "api", method: "GET", path: "/read", output: schemaType<boolean>() }, () => true)
			: createProcedure({ scope: "remote", output: schemaType<boolean>() }, () => true)
	const server = new Kizlo({
		baseUrl: "https://app.example/api",
		siteSecret: "secret",
		credentials,
		integrations: [createIntegration({ id: "probe", procedures: { read: procedure } })] as const,
	})

	for (const mode of ["result", "call"] as const) {
		const controller = new AbortController()
		let started = () => {}
		const ready = new Promise<void>((resolve) => {
			started = resolve
		})
		let requestSignal: AbortSignal | undefined
		const browser = await getKizloClientTestInstance(server, {
			fetch: (request) => {
				requestSignal = request.signal
				started()
				return new Promise<Response>((_, reject) => {
					request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true })
				})
			},
		})
		const probe = browser.client.probe
		if (!probe) throw new Error("Missing probe integration")
		const method = probe.read
		const pending =
			mode === "call" ? method.call(undefined, { signal: controller.signal }) : method(undefined, { signal: controller.signal })
		// Observe rejection before aborting, including the throwing .call() variant.
		const settled = pending.then(
			(value) => ({ value }),
			(error: unknown) => ({ error }),
		)
		await ready
		expect(requestSignal?.aborted).toBe(false)
		controller.abort(new Error("cancelled"))
		expect(requestSignal?.aborted).toBe(true)
		const outcome = await settled
		if (mode === "call") expect(outcome).toHaveProperty("error")
		else expect(outcome).toMatchObject({ value: { success: false } })
	}
})

test.each(["result", "call"] as const)(
	"direct server %s calls expose cancellation to middleware and downstream WordPress",
	async (mode) => {
		const controller = new AbortController()
		const signals: Array<AbortSignal | undefined> = []
		let started = () => {}
		const ready = new Promise<void>((resolve) => {
			started = resolve
		})
		const fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
			expect(init?.signal).toBe(controller.signal)
			started()
			return new Promise<Response>((_, reject) => {
				init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true })
			})
		})
		vi.stubGlobal("fetch", fetch)
		const read = createProcedure(
			{
				scope: "remote",
				output: schemaType<boolean>(),
				middlewares: [
					createMiddleware(async ({ signal, next }) => {
						signals.push(signal)
						return next()
					}),
				],
			},
			async ({ context, signal }) => {
				signals.push(signal)
				const result = await context.wordpress.get("wp-json/kizlo/v1/settings", { signal })
				if (result.error) throw result.error
				return true
			},
		)
		const server = new Kizlo({
			baseUrl: "https://app.example/api",
			siteSecret: "secret",
			credentials,
			integrations: [createIntegration({ id: "probe", procedures: { read } })] as const,
		})
		const probe = server.client.probe
		if (!probe) throw new Error("Missing probe integration")
		const pending =
			mode === "call" ? probe.read.call(undefined, { signal: controller.signal }) : probe.read(undefined, { signal: controller.signal })
		const settled = pending.then(
			(value) => ({ value }),
			(error: unknown) => ({ error }),
		)
		await ready
		controller.abort(new Error("cancelled"))
		const outcome = await settled
		expect(signals).toEqual([controller.signal, controller.signal])
		if (mode === "call") expect(outcome).toHaveProperty("error")
		else expect(outcome).toMatchObject({ value: { success: false } })
	},
)
