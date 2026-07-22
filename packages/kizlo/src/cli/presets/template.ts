import path from "node:path"
import { TEMPLATE_SUBSETS } from "./generated/templates"
import type { ScaffoldContext, ScaffoldFile } from "./types"

/** Role → the human label init uses in prompts and logs. Mirrors the old hardcoded labels. */
const ROLE_LABELS: Record<string, string> = {
	"server-entry": "Kizlo server instance",
	client: "Browser client",
	"api-route": "API route",
	robots: "robots.txt route",
	sitemap: "sitemap route",
	"sitemap-redirect": "sitemap.xml redirect route",
	manifest: "web manifest route",
}

/**
 * Turn a framework's extracted template subset into the {@link ScaffoldFile}s init writes, by
 * substituting the tokens the extractor left behind: the path prefixes (`{{kizloDir}}`, `{{appDir}}`)
 * with the project's real directories, and `{{serverImport}}` with the import specifier resolved for
 * each file's location (tsconfig alias or relative). The single source of these bodies is the
 * template folder, so init and `create` can never drift.
 */
export function materializeTemplate(framework: string, ctx: ScaffoldContext): ScaffoldFile[] {
	const files = TEMPLATE_SUBSETS[framework] ?? []
	return files.map((file) => {
		const relPath = file.tokenizedPath.replaceAll("{{kizloDir}}", ctx.kizloDir).replaceAll("{{appDir}}", ctx.appDir)
		const fromDir = path.posix.dirname(relPath)
		const contents = file.body.replaceAll("{{serverImport}}", ctx.serverImport(fromDir))
		return { label: ROLE_LABELS[file.role] ?? file.role, relPath, contents }
	})
}
