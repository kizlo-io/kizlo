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
	scaffolds(ctx) {
		const apiDir = `${ctx.appDir}/api/kizlo/[[...rest]]`
		const robotsDir = `${ctx.appDir}/robots.txt`
		const sitemapDir = `${ctx.appDir}/sitemaps/[sitemap]`
		return [
			{
				label: "Kizlo server instance",
				relPath: ctx.serverEntryPath,
				contents: `import { createKizlo } from "kizlo/nextjs/server"

export const { router, client, context, handler } = createKizlo()
`,
			},
			{
				label: "Browser client",
				relPath: ctx.clientPath,
				contents: `import { createKizloClient } from "kizlo/nextjs"
import { contract } from "./${ctx.serverDirName}/generated"

export const client = createKizloClient(contract)
`,
			},
			{
				label: "API route",
				relPath: `${apiDir}/route.ts`,
				contents: `import { handler } from "${ctx.serverImport(apiDir)}"

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE, handler as OPTIONS }
`,
			},
			{
				label: "robots.txt route",
				relPath: `${robotsDir}/route.ts`,
				contents: `import { createRobotsRoute } from "kizlo/nextjs/server"
import { client } from "${ctx.serverImport(robotsDir)}"

// Run on the edge: cheaper and faster than Node for a response this small.
export const runtime = "edge"

// Vercel treats special metadata files like robots.txt and sitemap.xml as completely static
// files at build time, bypassing normal Incremental Static Regeneration (ISR) and on-demand
// revalidatePath rules.
//
// While your revalidation logic executes perfectly in a local Node.js server, Vercel uploads
// these routes directly to its Edge CDN as immutable assets. Subsequent on-demand revalidation
// triggers will successfully clear the Data Cache but fail to purge the CDN-level Edge cache
// for that file.
//
// force-dynamic opts out of that static treatment so CMS edits show up; the WordPress call is
// cached, so requests stay cheap.
export const dynamic = "force-dynamic"

export const GET = createRobotsRoute(client)
`,
			},
			{
				label: "sitemap route",
				relPath: `${sitemapDir}/route.ts`,
				contents: `import { createSitemapRoute } from "kizlo/nextjs/server"
import { client } from "${ctx.serverImport(sitemapDir)}"

// Unlike robots.txt, Vercel revalidates this route on demand, so it can stay static. It's
// served from the CDN at no per-request cost and still refreshes when content changes.
export const dynamic = "force-static"

export const GET = createSitemapRoute(client)
`,
			},
		]
	},
}
