import type { Plugin } from "vite"

const stages = new Map<string, readonly [string, string]>([
	["vinext/server/request-stage", ["loadVinextRequestStage", "handleRequestStage"]],
	["vinext/server/response-stage", ["loadVinextResponseStage", "handleResponseStage"]],
])

/** Capture Cloudflare context inside each Vinext stage, including cache misses and regeneration. */
export function cloudflareVinext(): Plugin {
	const modules = new Map<string, { original: string; loader: string; handler: string }>()
	return {
		name: "kizlo:cloudflare-vinext",
		enforce: "pre",
		async resolveId(source, importer) {
			const stage = stages.get(source)
			if (!stage) return null
			const resolved = await this.resolve(source, importer, { skipSelf: true })
			if (!resolved) return this.error(`Cannot resolve ${source}. Use a Vinext release exposing the public stage loaders.`)
			const id = `\0kizlo:cloudflare:${resolved.id}`
			modules.set(id, { original: resolved.id, loader: stage[0], handler: stage[1] })
			return id
		},
		load(id) {
			const stage = modules.get(id)
			if (!stage) return null
			return `
import { withCloudflareRequest } from "kizlo/cloudflare";
import { ${stage.loader} as loadStage } from ${JSON.stringify(stage.original)};
export * from ${JSON.stringify(stage.original)};
export async function ${stage.loader}(...args) {
	const stage = await loadStage(...args);
	return {
		...stage,
		${stage.handler}(request, ...args) {
			return withCloudflareRequest(request, () => stage.${stage.handler}(request, ...args));
		}
	};
}
`
		},
	}
}
