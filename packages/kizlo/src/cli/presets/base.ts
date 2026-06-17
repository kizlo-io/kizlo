import type { Preset } from "./types"

export const base: Preset = {
	id: "base",
	label: "Generic (no framework detected)",
	// Always matches, but at the lowest priority — the fallback when no
	// framework-specific preset claims the project.
	detect: () => 1,
	baseUrlEnvKey: "SERVER_BASE_URL",
	serverEntry() {
		return `import { createKizlo } from "kizlo"

export const { router, client, context, handler } = createKizlo()
`
	},
	clientEntry(ctx) {
		return `import { createKizloClient } from "kizlo"
import { contract } from "./${ctx.serverDirName}/generated"

export const client = createKizloClient(contract)
`
	},
}
