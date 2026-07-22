import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { downloadTemplate } from "giget"

/** GitHub repo the templates are fetched from. */
const TEMPLATE_REPO = "github:kizlo-io/kizlo"

/**
 * Resolve where a template is fetched from. Defaults to the templates on the repo's default branch:
 * the template is decoupled from the CLI version — it declares its own `kizlo` dependency — so there
 * is no tag to match and no release to cut. `KIZLO_TEMPLATE_LOCAL_DIR` points at a local `templates/`
 * directory so development (and `create`/`init` tests) never touch the network.
 */
export function templateSource(template: string): { local?: string; remote?: string } {
	const localDir = process.env.KIZLO_TEMPLATE_LOCAL_DIR
	if (localDir) return { local: path.resolve(localDir, template) }
	return { remote: `${TEMPLATE_REPO}/templates/${template}` }
}

export interface FetchedTemplate {
	/** A readable directory holding the template's files (the local dir, or a downloaded temp copy). */
	dir: string
	/** Remove the temp copy when done. A no-op for a local directory — never delete the user's source. */
	cleanup: () => void
}

/**
 * Get the template as a readable directory both `create` and `init` can copy from or read. With
 * `KIZLO_TEMPLATE_LOCAL_DIR` set it's the local folder (returned as-is, cleanup is a no-op). Otherwise
 * it's downloaded once into a fresh temp directory the caller cleans up. The single fetch path shared
 * by both commands, so they can never source different bytes.
 */
export async function fetchTemplate(template: string): Promise<FetchedTemplate> {
	const source = templateSource(template)
	if (source.local) {
		if (!fs.existsSync(source.local)) throw new Error(`Local template not found: ${source.local}`)
		return { dir: source.local, cleanup: () => {} }
	}
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-template-"))
	await downloadTemplate(source.remote as string, { dir, forceClean: true })
	return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) }
}
