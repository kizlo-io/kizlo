import { describe, expect, test } from "vitest"
import { base } from "./base"
import type { ScaffoldContext } from "./types"

/** A minimal `src/`-project context; the base preset only reads the paths and import helpers. */
function context(): ScaffoldContext {
	return {
		kizloPath: "src/lib/kizlo",
		serverDirName: "server",
		serverEntryPath: "src/lib/kizlo/server/index.ts",
		clientPath: "src/lib/kizlo/client.ts",
		hasSrcDir: true,
		serverImport: () => "@/lib/kizlo/server",
		importFrom: (targetRel) => `@/${targetRel.replace(/^src\//, "")}`,
	}
}

describe("base preset server entry", () => {
	test("imports the generated introspection and passes it to createKizlo", () => {
		const server = base.scaffolds(context()).find((file) => file.relPath.endsWith("server/index.ts"))
		if (!server) throw new Error("base preset did not scaffold a server entry")

		expect(server.contents).toContain('import { introspection } from "./generated"')
		expect(server.contents).toContain("createKizlo({ integrations: [node()], introspection })")
		expect(server.contents).not.toContain("wordpress: { endpoints }")
	})
})
