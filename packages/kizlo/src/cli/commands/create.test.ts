import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { promptFragment, readManifest, resolvePromptDefault, type TemplatePrompt } from "../presets/template"
import { getVersion, tokenizeCommand } from "../utils"
import { applyManifestWiring, bootstrapArgs, isDirScaffoldable, normalizeProjectName, projectName } from "./create"

const here = path.dirname(fileURLToPath(import.meta.url))
const templateDir = path.resolve(here, "../../../../../templates/nextjs")
const astroTemplateDir = path.resolve(here, "../../../../../templates/astro")
const tanstackTemplateDir = path.resolve(here, "../../../../../templates/tanstack-start-react")

describe("bootstrapArgs", () => {
	const manifest = readManifest(templateDir)

	it("tokenizes the manifest command, substituting {{pm}} and {{name}}", () => {
		const argv = bootstrapArgs(manifest, "pnpm", "my-app", { linter: "--no-eslint", tailwind: "", reactCompiler: "" })
		expect(argv?.slice(0, 4)).toEqual(["pnpm", "create", "next-app@latest", "my-app"])
		// `--import-alias @/*` stays two separate tokens, and the alias survives tokenizing intact.
		const aliasFlag = argv?.indexOf("--import-alias")
		expect(argv?.[(aliasFlag as number) + 1]).toBe("@/*")
		// Both tokens are resolved to the chosen manager / project name, and none remain unsubstituted.
		expect(argv).toContain("--use-pnpm")
		expect(argv?.some((arg) => arg.includes("{{pm}}") || arg.includes("{{name}}") || arg.includes("{{linter}}"))).toBe(false)
	})

	it("substitutes {{name}} into whichever position the template places it", () => {
		const argv = bootstrapArgs(manifest, "npm", "cool-app", { linter: "--no-eslint", tailwind: "", reactCompiler: "" })
		expect(argv?.slice(0, 4)).toEqual(["npm", "create", "next-app@latest", "cool-app"])
		expect(argv).toContain("--use-npm")
	})

	it("expands {{dlx}} to the manager's exec command for a non-create-* CLI", () => {
		const tanstackManifest = readManifest(tanstackTemplateDir)
		// pnpm/yarn spell it `<pm> dlx` (two tokens); npm uses `npx`, bun uses `bunx` (one token).
		expect(bootstrapArgs(tanstackManifest, "pnpm", "my-app")?.slice(0, 3)).toEqual(["pnpm", "dlx", "@tanstack/cli@latest"])
		expect(bootstrapArgs(tanstackManifest, "npm", "my-app")?.slice(0, 2)).toEqual(["npx", "@tanstack/cli@latest"])
		expect(bootstrapArgs(tanstackManifest, "bun", "my-app")?.slice(0, 2)).toEqual(["bunx", "@tanstack/cli@latest"])
		// The `create` subcommand and remaining flags follow the exec command, and no token remains.
		const argv = bootstrapArgs(tanstackManifest, "pnpm", "my-app", { toolchain: "--no-toolchain", deployment: "" })
		expect(argv).toEqual([
			"pnpm",
			"dlx",
			"@tanstack/cli@latest",
			"create",
			"--target-dir",
			"my-app",
			"--blank",
			"--framework",
			"react",
			"-y",
			"--package-manager",
			"pnpm",
			"--no-install",
			"--no-git",
			"--no-toolchain",
		])
	})

	it("passes a path-style name through TanStack's --target-dir, not the URL-friendly slug positional", () => {
		// kizlo permits a path name (`apps/my-app`); TanStack's positional rejects the `/`, so the template
		// routes it through `--target-dir`, which derives the slug from the basename.
		const argv = bootstrapArgs(readManifest(tanstackTemplateDir), "pnpm", "apps/my-app")
		const targetDir = argv?.indexOf("--target-dir")
		expect(argv?.[(targetDir as number) + 1]).toBe("apps/my-app")
	})

	it("tokenizes the astro manifest command (no {{pm}} token in the initializer)", () => {
		const astroManifest = readManifest(astroTemplateDir)
		const argv = bootstrapArgs(astroManifest, "pnpm", "my-app")
		expect(argv?.slice(0, 4)).toEqual(["pnpm", "create", "astro@latest", "my-app"])
		expect(argv).toContain("--template")
		expect(argv).toContain("minimal")
		// create-astro infers the package manager from the invoker, so there is no {{pm}} substitution.
		expect(argv?.some((arg) => arg.includes("{{pm}}"))).toBe(false)
	})

	it("splices a prompt fragment into the bootstrap via its {{token}}", () => {
		const argv = bootstrapArgs(manifest, "pnpm", "my-app", { linter: "--eslint", tailwind: "", reactCompiler: "" })
		expect(argv).toContain("--eslint")
		expect(argv).not.toContain("--no-eslint")
		expect(argv?.some((arg) => arg.includes("{{linter}}"))).toBe(false)
	})

	it("drops a prompt token whose fragment is empty, leaving the surrounding flags intact", () => {
		const argv = bootstrapArgs(manifest, "pnpm", "my-app", { linter: "", tailwind: "", reactCompiler: "" })
		// No stray empty token and no leftover placeholder.
		expect(argv?.some((arg) => arg === "" || arg.includes("{{linter}}"))).toBe(false)
		// The flags that flanked {{linter}} still line up.
		const aliasFlag = argv?.indexOf("--import-alias")
		expect(argv?.[(aliasFlag as number) + 1]).toBe("@/*")
		expect(argv).toContain("--skip-install")
	})

	it("expands a multi-flag prompt fragment into separate argv tokens", () => {
		const argv = bootstrapArgs(manifest, "pnpm", "my-app", { linter: "--eslint --strict", tailwind: "", reactCompiler: "" })
		expect(argv).toContain("--eslint")
		expect(argv).toContain("--strict")
	})
})

describe("template prompts", () => {
	const select: TemplatePrompt = {
		kind: "select",
		token: "linter",
		message: "Which linter?",
		default: "none",
		options: [
			{ label: "ESLint", value: "eslint", arg: "--eslint" },
			{ label: "None", value: "none", arg: "--no-eslint" },
		],
	}
	const confirm: TemplatePrompt = {
		kind: "confirm",
		token: "tp",
		message: "Turbopack?",
		default: true,
		arg: "--turbopack",
		argFalse: "--no-turbopack",
	}
	const text: TemplatePrompt = { kind: "text", token: "alias", message: "Import alias?", arg: "--import-alias {{value}}" }

	it("resolvePromptDefault picks a select's default option, else the first", () => {
		expect(resolvePromptDefault(select)).toEqual({ answer: "none", arg: "--no-eslint" })
		expect(resolvePromptDefault({ ...select, default: undefined })).toEqual({ answer: "eslint", arg: "--eslint" })
	})

	it("resolvePromptDefault maps a confirm default to arg / argFalse", () => {
		expect(resolvePromptDefault(confirm)).toEqual({ answer: true, arg: "--turbopack" })
		expect(resolvePromptDefault({ ...confirm, default: false })).toEqual({ answer: false, arg: "--no-turbopack" })
	})

	it("promptFragment falls back to the first option for a stale select answer", () => {
		expect(promptFragment(select, "gone")).toBe("--eslint")
	})

	it("promptFragment shell-quotes a text value so spaces survive tokenizing", () => {
		const fragment = promptFragment(text, "my alias")
		expect(fragment).toBe('--import-alias "my alias"')
		// Spliced into a command, the quoted value stays exactly one argv token.
		expect(tokenizeCommand(`create ${fragment}`)).toEqual(["create", "--import-alias", "my alias"])
	})

	it("promptFragment contributes nothing for an empty text value with the default arg", () => {
		const bare: TemplatePrompt = { kind: "text", token: "x", message: "?", arg: "{{value}}" }
		expect(promptFragment(bare, "")).toBe("")
	})
})

describe("manifest prompt guard", () => {
	let dir: string
	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-manifest-"))
	})
	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true })
	})

	const writeManifest = (prompts: unknown[]): void => {
		const manifest = {
			id: "x",
			config: { alias: "@", kizloPath: "src/lib/kizlo" },
			create: { command: "{{pm}} create x {{name}}", prompts },
		}
		fs.writeFileSync(path.join(dir, "template.json"), JSON.stringify(manifest))
	}

	it("rejects a prompt token that shadows a core token", () => {
		writeManifest([{ kind: "select", token: "name", message: "?", options: [{ label: "A", value: "a", arg: "--a" }] }])
		expect(() => readManifest(dir)).toThrow()
	})

	it("rejects duplicate prompt tokens", () => {
		writeManifest([
			{ kind: "confirm", token: "dup", message: "?" },
			{ kind: "confirm", token: "dup", message: "?" },
		])
		expect(() => readManifest(dir)).toThrow()
	})
})

describe("projectName", () => {
	it("accepts a bare folder name", () => {
		expect(projectName("my-app")).toBeUndefined()
		expect(projectName("My_App.2")).toBeUndefined()
	})

	it("accepts relative and absolute paths, validating only the last segment", () => {
		expect(projectName("apps/my-app")).toBeUndefined()
		expect(projectName("./apps/my-app")).toBeUndefined()
		expect(projectName("../sibling/my-app")).toBeUndefined()
		expect(projectName("/srv/www/my-app")).toBeUndefined()
		// A trailing separator still resolves to the real final segment.
		expect(projectName("apps/my-app/")).toBeUndefined()
	})

	it("accepts a lone `.` — the opt-in to scaffold into the current directory", () => {
		expect(projectName(".")).toBeUndefined()
	})

	it("rejects an empty name or one whose final segment isn't a folder", () => {
		expect(projectName("")).toBeDefined()
		expect(projectName("apps/..")).toBeDefined()
		// `.` is only the current-dir opt-in on its own — not as a path segment.
		expect(projectName("apps/.")).toBeDefined()
		expect(projectName("apps/my app")).toBeDefined()
	})
})

describe("isDirScaffoldable", () => {
	let dir: string

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-scaffoldable-"))
	})

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true })
	})

	it("treats an empty directory (or one with only .git/.DS_Store) as scaffoldable", () => {
		expect(isDirScaffoldable(dir)).toBe(true)
		fs.mkdirSync(path.join(dir, ".git"))
		fs.writeFileSync(path.join(dir, ".DS_Store"), "")
		expect(isDirScaffoldable(dir)).toBe(true)
	})

	it("rejects a directory that holds real files", () => {
		fs.writeFileSync(path.join(dir, "README.md"), "hi")
		expect(isDirScaffoldable(dir)).toBe(false)
	})
})

describe("normalizeProjectName", () => {
	it("trims and drops a redundant leading ./ and trailing separator", () => {
		expect(normalizeProjectName("  my-app  ")).toBe("my-app")
		expect(normalizeProjectName("./templates/my-app")).toBe("templates/my-app")
		expect(normalizeProjectName("templates/my-app/")).toBe("templates/my-app")
		expect(normalizeProjectName("./templates/my-app/")).toBe("templates/my-app")
	})

	it("preserves ../ and absolute paths", () => {
		expect(normalizeProjectName("../sibling/my-app")).toBe("../sibling/my-app")
		expect(normalizeProjectName("/srv/www/my-app")).toBe("/srv/www/my-app")
	})
})

/**
 * The wiring half of `create`, given an already-fetched template directory (the framework CLI is not
 * run here). A temp directory is seeded to look like create-next-app's output — a `package.json`, a
 * tsconfig with the `@/*` alias, and a root layout that renders `<html>` and carries a static
 * `metadata` export — then `applyManifestWiring` layers Kizlo on top. Asserts the invariants that make
 * it a wired project.
 */
describe("applyManifestWiring", () => {
	const manifest = readManifest(templateDir)
	let dir: string

	/** Seed `dir` with the files create-next-app would have produced (with the flags the manifest uses). */
	function seedNextApp(): void {
		fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "my-app", dependencies: { next: "^16.0.0" } }, null, 2))
		fs.writeFileSync(path.join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }))
		const layout = `import type { Metadata } from "next"

export const metadata: Metadata = { title: "Create Next App", description: "Generated by create next app" }

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	)
}
`
		fs.mkdirSync(path.join(dir, "src/app"), { recursive: true })
		fs.writeFileSync(path.join(dir, "src/app/layout.tsx"), layout)
	}

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-create-"))
		seedNextApp()
	})

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true })
	})

	it("scaffolds the wiring and starter files, records the kizlo dep, and writes the wired layout", async () => {
		await applyManifestWiring(dir, templateDir, manifest, { includeExamples: true })

		// Wiring files land where the manifest conventions place them.
		expect(fs.existsSync(path.join(dir, "src/lib/kizlo/server/index.ts"))).toBe(true)
		expect(fs.existsSync(path.join(dir, "src/app/api/kizlo/[[...rest]]/route.ts"))).toBe(true)
		// Generated contract is seeded so imports resolve before the first watch/generate.
		expect(fs.existsSync(path.join(dir, "src/lib/kizlo/server/generated/contract.json"))).toBe(true)

		// Demo starter files come along on create (they are skipped by init).
		expect(fs.existsSync(path.join(dir, "src/app/page.tsx"))).toBe(true)
		expect(fs.existsSync(path.join(dir, "src/app/blog/[slug]/page.tsx"))).toBe(true)

		// kizlo.config.ts is written by create (not copied). With no local WordPress chosen, there's no
		// `local` block: the install folder is fixed at `.kizlo/local`, and the stacks are only written
		// when local WordPress is chosen.
		const config = fs.readFileSync(path.join(dir, "kizlo.config.ts"), "utf8")
		expect(config).toContain('dir: "src/lib/kizlo"')
		// The alias is persisted in its canonical `@/` form (how it's written and declared in tsconfig),
		// not a bare `@`, so create and init record it the same way.
		expect(config).toContain('alias: "@/"')
		expect(config).not.toContain("local:")

		// The scaffold ignores `.env` and the `.kizlo/` working dir (which holds the local WordPress install).
		const gitignore = fs.readFileSync(path.join(dir, ".gitignore"), "utf8").split(/\r?\n/)
		expect(gitignore).toContain(".env")
		expect(gitignore).toContain(".kizlo/")

		// The kizlo dependency is recorded (from the template's stamped version) without installing.
		const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"))
		expect(pkg.dependencies.kizlo).toBe(`^${getVersion()}`)
		expect(pkg.dependencies.next).toBe("^16.0.0")

		// Merged deps are re-sorted alphabetically so the scaffold passes sherif's unordered-dependencies check.
		const depNames = Object.keys(pkg.dependencies)
		expect(depNames).toEqual([...depNames].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)))

		// On a fresh app Kizlo owns the layout, so create writes it whole, already SEO-wired — the
		// framework's static `metadata` export is gone, replaced by Kizlo's `generateMetadata`.
		const layout = fs.readFileSync(path.join(dir, "src/app/layout.tsx"), "utf8")
		expect(layout).toContain("generateMetadata")
		expect(layout).toContain("createRootMetadata")
		expect(layout).not.toContain("export const metadata")
	})

	it("enables local WordPress in the config when local WordPress is chosen", async () => {
		await applyManifestWiring(dir, templateDir, manifest, { includeExamples: false, localDev: true })

		const config = fs.readFileSync(path.join(dir, "kizlo.config.ts"), "utf8")
		expect(config).toContain("local: { dev: {}, test: {} }")
	})

	it("skips only the example pages when declined, still writing the core layout", async () => {
		await applyManifestWiring(dir, templateDir, manifest, { includeExamples: false })

		// Core create wiring still lands: the SEO-wired layout (overwriting the framework's).
		const layout = fs.readFileSync(path.join(dir, "src/app/layout.tsx"), "utf8")
		expect(layout).toContain("createRootMetadata")
		expect(layout).not.toContain("export const metadata")

		// The `example`-flagged demo pages are the only thing skipped.
		expect(fs.existsSync(path.join(dir, "src/app/page.tsx"))).toBe(false)
		expect(fs.existsSync(path.join(dir, "src/app/blog/[slug]/page.tsx"))).toBe(false)
	})
})

/**
 * The wiring half of `create` for the Astro template. A temp directory is seeded to look like
 * create-astro's minimal output (a bare `astro.config.mjs`, a `package.json` with `astro`, a
 * placeholder tsconfig and page), then `applyManifestWiring` layers Kizlo on top. Asserts that the
 * endpoints land under `src/pages`, Kizlo owns the SSR config + `@/*` tsconfig on a fresh app, and the
 * `@astrojs/node` adapter dep is recorded.
 */
describe("applyManifestWiring (astro)", () => {
	const manifest = readManifest(astroTemplateDir)
	let dir: string

	function seedAstroApp(): void {
		fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "my-app", dependencies: { astro: "^7.1.3" } }, null, 2))
		fs.writeFileSync(path.join(dir, "astro.config.mjs"), "import { defineConfig } from 'astro/config'\nexport default defineConfig({})\n")
		fs.writeFileSync(path.join(dir, "tsconfig.json"), JSON.stringify({ extends: "astro/tsconfigs/strict" }))
		fs.mkdirSync(path.join(dir, "src/pages"), { recursive: true })
	}

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-create-astro-"))
		seedAstroApp()
	})

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true })
	})

	it("scaffolds Astro wiring, owns the SSR config, and records the node adapter", async () => {
		await applyManifestWiring(dir, astroTemplateDir, manifest, { includeExamples: true })

		// Wiring lands under the Astro conventions (src/pages, src/lib/kizlo, src/components).
		expect(fs.existsSync(path.join(dir, "src/lib/kizlo/server/index.ts"))).toBe(true)
		expect(fs.existsSync(path.join(dir, "src/pages/api/kizlo/[...rest].ts"))).toBe(true)
		expect(fs.existsSync(path.join(dir, "src/pages/robots.txt.ts"))).toBe(true)
		expect(fs.existsSync(path.join(dir, "src/components/BaseHead.astro"))).toBe(true)
		expect(fs.existsSync(path.join(dir, "src/lib/kizlo/server/generated/contract.json"))).toBe(true)

		// Demo starters come along on create.
		expect(fs.existsSync(path.join(dir, "src/pages/index.astro"))).toBe(true)
		expect(fs.existsSync(path.join(dir, "src/pages/blog/[slug].astro"))).toBe(true)

		// On a fresh app Kizlo owns the framework config, overwriting the seeded `defineConfig({})` with
		// the template's SSR + node adapter setup (the engine force-writes over the framework default).
		const config = fs.readFileSync(path.join(dir, "astro.config.mjs"), "utf8")
		expect(config).toContain('output: "server"')
		expect(config).toContain("@astrojs/node")

		// The tsconfig belongs to the framework CLI — Kizlo leaves the seeded one exactly as it found it.
		expect(JSON.parse(fs.readFileSync(path.join(dir, "tsconfig.json"), "utf8"))).toEqual({ extends: "astro/tsconfigs/strict" })

		// The kizlo + node adapter deps are recorded without installing.
		const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"))
		expect(pkg.dependencies.kizlo).toBe(`^${getVersion()}`)
		expect(pkg.dependencies["@astrojs/node"]).toBe("^11.0.2")
		expect(pkg.dependencies.astro).toBe("^7.1.3")

		// The root layout renders the SEO head component.
		const layout = fs.readFileSync(path.join(dir, "src/layouts/Layout.astro"), "utf8")
		expect(layout).toContain("BaseHead")
	})

	it("writes relative imports when create-astro declared no alias", async () => {
		// create-astro leaves no `paths`, and Kizlo no longer supplies a tsconfig that would add one, so
		// every import — the server entry and the template's own `@/layouts/…` — must resolve relatively.
		await applyManifestWiring(dir, astroTemplateDir, manifest, { includeExamples: true })

		expect(fs.readFileSync(path.join(dir, "src/pages/api/kizlo/[...rest].ts"), "utf8")).toContain('"../../../lib/kizlo/server"')
		expect(fs.readFileSync(path.join(dir, "src/pages/index.astro"), "utf8")).toContain('"../layouts/Layout.astro"')
		expect(fs.readFileSync(path.join(dir, "kizlo.config.ts"), "utf8")).toContain('alias: ""')
	})

	it("uses the alias when the project itself declares one", async () => {
		fs.writeFileSync(
			path.join(dir, "tsconfig.json"),
			JSON.stringify({ extends: "astro/tsconfigs/strict", compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
		)
		await applyManifestWiring(dir, astroTemplateDir, manifest, { includeExamples: true })

		expect(fs.readFileSync(path.join(dir, "src/pages/api/kizlo/[...rest].ts"), "utf8")).toContain('"@/lib/kizlo/server"')
		expect(fs.readFileSync(path.join(dir, "kizlo.config.ts"), "utf8")).toContain('alias: "@/"')
	})

	it("skips only the example pages when declined, still writing the core config and layout", async () => {
		await applyManifestWiring(dir, astroTemplateDir, manifest, { includeExamples: false })

		expect(fs.readFileSync(path.join(dir, "astro.config.mjs"), "utf8")).toContain('output: "server"')
		expect(fs.existsSync(path.join(dir, "src/layouts/Layout.astro"))).toBe(true)

		// The `example`-flagged demo pages are skipped; core wiring (robots endpoint) still lands.
		expect(fs.existsSync(path.join(dir, "src/pages/index.astro"))).toBe(false)
		expect(fs.existsSync(path.join(dir, "src/pages/blog/[slug].astro"))).toBe(false)
		expect(fs.existsSync(path.join(dir, "src/pages/robots.txt.ts"))).toBe(true)
	})
})
