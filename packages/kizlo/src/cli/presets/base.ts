import type { Preset, ScaffoldContext } from "./types"

export const base: Preset = {
	id: "base",
	label: "Generic (no framework detected)",
	detect: () => 1,
	baseUrlEnvKey: "KIZLO_BACKEND_URL",
	scaffolds(ctx) {
		return [
			{
				label: "Kizlo server instance",
				relPath: ctx.serverEntryPath,
				contents: `import { createKizlo } from "kizlo"

export const { router, client, context, handler } = createKizlo()
`,
			},
			{ label: "Browser client", relPath: ctx.clientPath, contents: clientEntry(ctx) },
		]
	},
}

function clientEntry(ctx: ScaffoldContext): string {
	if (ctx.clientUrl) {
		return `import { createKizloClient } from "kizlo"
import { contract } from "./${ctx.serverDirName}/generated"

// Your Kizlo backend runs on a different origin than this app. Swap in your bundler's
// public env var (e.g. import.meta.env.VITE_KIZLO_BACKEND_URL) to set it per environment.
export const client = createKizloClient(contract, { url: "${ctx.clientUrl}" })
`
	}
	return `import { createKizloClient } from "kizlo"
import { contract } from "./${ctx.serverDirName}/generated"

export const client = createKizloClient(contract)
`
}
