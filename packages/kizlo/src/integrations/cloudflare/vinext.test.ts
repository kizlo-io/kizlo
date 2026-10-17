import { AsyncResource } from "node:async_hooks"
import { build, type Plugin } from "vite"
import { expect, test } from "vitest"
import { cloudflareVinext } from "./vinext"

test("builds request and response stage loaders that capture context at each invocation", async () => {
	const root = new URL(".", import.meta.url).pathname
	const fixture: Plugin = {
		name: "vinext-stage-fixture",
		resolveId(source) {
			if (source.startsWith("\0fixture:")) return source
			if (source === "stage-consumer") return "\0stage-consumer"
			if (source === "kizlo/cloudflare") return `${root}request-context.ts`
			if (source === "vinext/server/request-stage" || source === "vinext/server/response-stage") return `\0fixture:${source}`
		},
		load(id) {
			if (id === "\0stage-consumer")
				return `
export { loadVinextRequestStage } from "vinext/server/request-stage";
export { loadVinextResponseStage } from "vinext/server/response-stage";
export { geoCloudflare, withCloudflareRequest } from "kizlo/cloudflare";
`
			if (id.startsWith("\0fixture:vinext/server/")) {
				const requestStage = id.endsWith("request-stage")
				const loader = requestStage ? "loadVinextRequestStage" : "loadVinextResponseStage"
				const handler = requestStage ? "handleRequestStage" : "handleResponseStage"
				return `
export async function ${loader}(value) {
	return { value, ${handler}(request, handle) { return handle(request); }, invokeCacheFunction(fn) { return fn(); } };
}
`
			}
		},
	}
	const result = await build({
		configFile: false,
		plugins: [cloudflareVinext(), fixture],
		logLevel: "silent",
		build: {
			ssr: true,
			write: false,
			minify: false,
			rolldownOptions: { input: "stage-consumer", output: { codeSplitting: false } },
		},
	})
	if (Array.isArray(result) || !("output" in result)) throw new Error("Expected a single build")
	const chunk = result.output.find((entry) => entry.type === "chunk")
	if (!chunk) throw new Error("Expected the built stage consumer")
	const consumer = await import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(chunk.code).toString("base64")}`)
	const contextFree = new AsyncResource("cloudflare-service-binding")
	const geo = consumer.geoCloudflare()
	const currentIp = async () => (await geo.getConnInfo(null)).ip
	const request = (ip?: string) => new Request("https://app.example", { headers: ip ? { "cf-connecting-ip": ip } : {} })
	try {
		for (const loadStage of [consumer.loadVinextRequestStage, consumer.loadVinextResponseStage]) {
			const stage = await loadStage("preserved export")
			expect(stage.value).toBe("preserved export")
			const handle = stage.handleRequestStage ?? stage.handleResponseStage
			const responses = await Promise.all(
				["203.0.113.1", "2001:db8::2"].map((ip) =>
					contextFree.runInAsyncScope(() =>
						handle(request(ip), async (incoming: Request) => {
							await Promise.resolve()
							expect(incoming.headers.get("cf-connecting-ip")).toBe(ip)
							return Response.json({ ip: await currentIp() })
						}),
					),
				),
			)
			expect(await Promise.all(responses.map((response: Response) => response.json()))).toEqual([
				{ ip: "203.0.113.1" },
				{ ip: "2001:db8::2" },
			])
		}

		const responseStage = await consumer.loadVinextResponseStage()
		await consumer.withCloudflareRequest(request("203.0.113.9"), async () => {
			// Background regeneration may have no visitor even while another request is active.
			const response = await responseStage.handleResponseStage(request(), async () => Response.json({ ip: await currentIp() }))
			expect(await response.json()).toEqual({ ip: null })
			expect(await currentIp()).toBe("203.0.113.9")
			return new Response(null)
		})
		expect(await responseStage.invokeCacheFunction(currentIp)).toBeNull()
		expect(await currentIp()).toBeNull()
	} finally {
		contextFree.emitDestroy()
	}
})
