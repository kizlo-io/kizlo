import type { Preset } from "./types"

export const nextjs: Preset = {
	id: "nextjs",
	label: "Next.js",
	detect(ctx) {
		const deps = { ...ctx.pkg.dependencies, ...ctx.pkg.devDependencies }
		return deps.next ? 100 : 0
	},
	baseUrlEnvKey: "NEXT_PUBLIC_KIZLO_BACKEND_URL",
	apiPath: "/api/kizlo",
	serverEntry() {
		return `import { createKizlo } from "kizlo/nextjs/server"

export const { router, client, context, handler } = createKizlo()
`
	},
	clientEntry(ctx) {
		return `import { createKizloClient } from "kizlo/nextjs"
import { contract } from "./${ctx.serverDirName}/generated"

export const client = createKizloClient(contract)
`
	},
	routeHandler(ctx) {
		const dir = `${ctx.appDir}/api/kizlo/[[...rest]]`
		return {
			path: `${dir}/route.ts`,
			contents: `import { handler } from "${ctx.serverImport(dir)}"

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE, handler as OPTIONS }
`,
		}
	},
}
