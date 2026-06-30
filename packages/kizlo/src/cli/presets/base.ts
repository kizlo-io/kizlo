import type { Preset } from "./types"

export const base: Preset = {
	id: "base",
	label: "Generic (no framework detected)",
	// Always matches, but at the lowest priority — the fallback when no
	// framework-specific preset claims the project.
	detect: () => 1,
	baseUrlEnvKey: "KIZLO_BACKEND_URL",
	serverEntry() {
		return `import { createKizlo } from "kizlo"

export const { router, client, context, handler } = createKizlo()
`
	},
	clientEntry(ctx) {
		// Cross-origin deploy: the backend lives on a different origin than this app, so point the
		// client at it explicitly. Same-origin: omit the URL and let it default to the page origin.
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
	},
}
