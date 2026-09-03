import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { MIN_PLUGIN_VERSION, pluginUpdateMessage } from "@kizlo/shared"
import { afterEach, describe, expect, test, vi } from "vitest"
import type { IntrospectionDocument } from "../../wordpress/introspection"
import { INTROSPECTION_FIXTURE } from "../../wordpress/introspection.fixture"
import { assertGeneratedClientCompiles, GeneratedClientTypeError } from "../../wordpress/typecheck"
import type { ResolvedConfig } from "./config"
import {
	CONTRACT_BARREL,
	generateIntrospectionOnce,
	generateIntrospectionSource,
	generateOnce,
	LegacyRouterExportError,
	PartialContractError,
	reportGenerationError,
} from "./generate"
import { log } from "./logger"

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * Compiling the fixture is {@link assertGeneratedClientCompiles}'s own suite's job, and doing it
 * per test here would cost a program build each time. These tests drive it from the outside: what
 * reaches disk when it passes, and what does not when it throws.
 */
vi.mock("../../wordpress/typecheck", async (importActual) => ({
	...(await importActual<typeof import("../../wordpress/typecheck")>()),
	assertGeneratedClientCompiles: vi.fn(),
}))

function refused(): GeneratedClientTypeError {
	return new GeneratedClientTypeError([`schema "acme.book": Interface 'WP_AcmeBook' incorrectly extends interface 'WP_AcmeEntity'.`])
}

function config(cwd: string): ResolvedConfig {
	return {
		cwd,
		server: {
			dir: "src/kizlo/server",
			entry: "src/kizlo/server/index.ts",
			contractDir: "src/kizlo/server/generated",
			contractPath: "src/kizlo/server/generated/contract.json",
			barrelPath: "src/kizlo/server/generated/index.ts",
		},
		introspectionPath: "src/kizlo/server/generated/introspection.ts",
		introspectionMetaPath: ".kizlo/introspection.meta.json",
	}
}

/** A package with no server: only an introspection, at its own resolved path. */
function standalone(cwd: string, introspectionDir = "src/generated"): ResolvedConfig {
	return {
		cwd,
		introspectionPath: path.join(introspectionDir, "introspection.ts"),
		introspectionMetaPath: ".kizlo/introspection.meta.json",
	}
}

function modified(document = INTROSPECTION_FIXTURE, etag = '"fixture"'): Response {
	return Response.json(document, { headers: { etag } })
}

/** The fixture under a hash of its own, so a second generation is a fresh document rather than a 304. */
function altered(): IntrospectionDocument {
	return { ...INTROSPECTION_FIXTURE, hash: `sha256:${"d".repeat(64)}` }
}

function seedEnv(cwd: string): void {
	fs.writeFileSync(path.join(cwd, ".env"), "KIZLO_WP_URL=https://wp.example\nKIZLO_WP_USERNAME=admin\nKIZLO_WP_APP_PASSWORD=secret\n")
}

afterEach(() => {
	for (const key of ["KIZLO_WP_URL", "KIZLO_WP_USERNAME", "KIZLO_WP_APP_PASSWORD"]) delete process.env[key]
	vi.restoreAllMocks()
})

function project(): ResolvedConfig {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-generate-"))
	seedEnv(cwd)
	return config(cwd)
}

function writeServer(cfg: ResolvedConfig, source: string): void {
	if (!cfg.server) throw new Error("writeServer needs a server-backed config")
	const entry = path.join(cfg.cwd, cfg.server.entry)
	fs.mkdirSync(path.dirname(entry), { recursive: true })
	fs.writeFileSync(entry, source)
}

function responder(...responses: Response[]): typeof globalThis.fetch {
	const fetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
	for (const response of responses) fetch.mockResolvedValueOnce(response)
	return fetch as unknown as typeof globalThis.fetch
}

/**
 * What WordPress serves when one contributor's declaration could not be published: everything that
 * survived, plus an error diagnostic per exclusion. `acme.album` stands for the valid work that
 * arrived in the same document, so a test can tell "wrote the subset" from "wrote nothing".
 */
function excluded(): IntrospectionDocument {
	return {
		...INTROSPECTION_FIXTURE,
		hash: `sha256:${"c".repeat(64)}`,
		schemas: { ...INTROSPECTION_FIXTURE.schemas, "acme.album": { type: "object", properties: { title: { type: "string" } } } },
		diagnostics: [
			...INTROSPECTION_FIXTURE.diagnostics,
			{ type: "error", message: "Referenced schema does not exist.", data: { schema_id: "vendor.money" } },
			{ type: "error", message: "Declares no successful response.", data: { api_id: "vendor.orders", path: "/orders" } },
		],
	}
}

/** Everything the CLI said, as one string. */
function transcript(method: "warn" | "error"): string {
	return (log[method] as unknown as ReturnType<typeof vi.fn>).mock.calls.map((call: unknown[]) => call.join(" ")).join("\n")
}

function watchLog(): void {
	vi.spyOn(log, "warn").mockImplementation(() => {})
	vi.spyOn(log, "error").mockImplementation(() => {})
}

describe("generateOnce", () => {
	test("reads procedures and writes a barrel typed from that export", async () => {
		const cfg = project()
		const kizloModule = path.resolve(here, "../../kizlo.ts")
		writeServer(cfg, `import { createKizlo } from ${JSON.stringify(kizloModule)}\nexport const { procedures } = createKizlo()\n`)

		await expect(generateOnce(cfg, { fetch: responder(modified()) })).resolves.toMatchObject({ contract: "built" })
		const server = cfg.server as NonNullable<ResolvedConfig["server"]>
		expect(JSON.parse(fs.readFileSync(path.join(cfg.cwd, server.contractPath), "utf8"))).toHaveProperty("posts")
		expect(fs.readFileSync(path.join(cfg.cwd, server.barrelPath), "utf8")).toBe(CONTRACT_BARREL)
		expect(CONTRACT_BARREL).toContain('import type { procedures } from ".."')
		expect(CONTRACT_BARREL).toContain("typeof procedures")
		// The barrel re-exports from the introspection artifact, not the old wordpress.ts.
		expect(CONTRACT_BARREL).toContain('from "./introspection"')
	})

	test("generates the introspection alone when no server is configured", async () => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-generate-"))
		seedEnv(cwd)
		const cfg = standalone(cwd)

		await expect(generateOnce(cfg, { fetch: responder(modified()) })).resolves.toMatchObject({ contract: "none" })
		expect(fs.readFileSync(path.join(cwd, cfg.introspectionPath), "utf8")).toContain("WP_AcmeBook")
	})

	test("gives a targeted migration error for a legacy router export", async () => {
		const cfg = project()
		writeServer(cfg, "export const router = {}\n")

		await expect(generateOnce(cfg)).rejects.toThrow(LegacyRouterExportError)
		await expect(generateOnce(cfg)).rejects.toThrow(/exports `router`.*Rename that export to `procedures`/)
	})
})

describe("generateIntrospectionOnce", () => {
	test("fetches once, writes current output, and reuses the ETag without rewriting", async () => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-generate-"))
		seedEnv(cwd)
		const cfg = config(cwd)
		const fetch = vi
			.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
			.mockResolvedValueOnce(modified())
			.mockResolvedValueOnce(new Response(null, { status: 304 }))

		expect(await generateIntrospectionOnce(cfg, { fetch: fetch as unknown as typeof globalThis.fetch })).toBe("generated")
		const source = path.join(cwd, cfg.introspectionPath)
		const first = fs.readFileSync(source, "utf8")
		const mtime = fs.statSync(source).mtimeMs

		expect(await generateIntrospectionOnce(cfg, { fetch: fetch as unknown as typeof globalThis.fetch })).toBe("unchanged")
		expect(fs.readFileSync(source, "utf8")).toBe(first)
		expect(fs.statSync(source).mtimeMs).toBe(mtime)
		expect(new Headers(fetch.mock.calls[1]?.[1]?.headers).get("If-None-Match")).toBe('"fixture"')
		expect(fetch).toHaveBeenCalledTimes(2)
	})

	test.each([
		["a stub", "export {}\n"],
		["output from an older generator", "// Generated by Kizlo. Do not edit.\n// Introspection sha256:stale\n"],
	])("refetches instead of revalidating when the contract on disk is %s", async (_label, contents) => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-generate-"))
		seedEnv(cwd)
		const cfg = config(cwd)
		const fetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => modified())

		await generateIntrospectionOnce(cfg, { fetch: fetch as unknown as typeof globalThis.fetch })
		const file = path.join(cwd, cfg.introspectionPath)
		const generated = fs.readFileSync(file, "utf8")
		fs.writeFileSync(file, contents)

		// The ETag still matches, but the file it describes no longer does, so it must not be sent.
		expect(await generateIntrospectionOnce(cfg, { fetch: fetch as unknown as typeof globalThis.fetch })).toBe("generated")
		expect(new Headers(fetch.mock.calls[1]?.[1]?.headers).get("If-None-Match")).toBeNull()
		expect(fs.readFileSync(file, "utf8")).toBe(generated)
	})

	test("changes generated output when the selected contract changes", async () => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-generate-"))
		seedEnv(cwd)
		const cfg = config(cwd)
		const fetch = vi
			.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
			.mockResolvedValueOnce(modified())
			.mockResolvedValueOnce(
				modified(
					{
						...INTROSPECTION_FIXTURE,
						hash: `sha256:${"b".repeat(64)}`,
						schemas: { ...INTROSPECTION_FIXTURE.schemas, "acme.album": { type: "object", properties: {} } },
					},
					'"changed"',
				),
			)

		await generateIntrospectionOnce(cfg, { fetch: fetch as unknown as typeof globalThis.fetch })
		const before = fs.readFileSync(path.join(cwd, cfg.introspectionPath), "utf8")
		await generateIntrospectionOnce(cfg, { fetch: fetch as unknown as typeof globalThis.fetch })
		const after = fs.readFileSync(path.join(cwd, cfg.introspectionPath), "utf8")
		expect(after).not.toBe(before)
		expect(after).toContain("WP_AcmeAlbum")
	})

	test.each([
		["fetch failure", () => Promise.reject(new Error("offline"))],
		["invalid document", () => Promise.resolve(Response.json({ nope: true }))],
	])("preserves the last valid output after a %s", async (_label, next) => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-generate-"))
		seedEnv(cwd)
		const cfg = config(cwd)
		await generateIntrospectionOnce(cfg, { fetch: vi.fn(async () => modified()) as unknown as typeof globalThis.fetch })
		const sourcePath = path.join(cwd, cfg.introspectionPath)
		const metaPath = path.join(cwd, cfg.introspectionMetaPath)
		const source = fs.readFileSync(sourcePath, "utf8")
		const meta = fs.readFileSync(metaPath, "utf8")

		await expect(generateIntrospectionOnce(cfg, { fetch: vi.fn(next) as unknown as typeof globalThis.fetch })).rejects.toThrow()
		expect(fs.readFileSync(sourcePath, "utf8")).toBe(source)
		expect(fs.readFileSync(metaPath, "utf8")).toBe(meta)
	})
})

describe("generateIntrospectionSource", () => {
	test("returns current output without writing the client or its cache", async () => {
		const cfg = project()
		const source = await generateIntrospectionSource(cfg.cwd, { strict: true, fetch: responder(modified()) })

		expect(source).toContain("WP_AcmeBook")
		expect(fs.existsSync(path.join(cfg.cwd, cfg.introspectionPath))).toBe(false)
		expect(fs.existsSync(path.join(cfg.cwd, cfg.introspectionMetaPath))).toBe(false)
	})
})

describe("a contract WordPress excluded a contribution from", () => {
	test("regenerates from the validated subset rather than leaving the client stale", async () => {
		watchLog()
		const cfg = project()
		const source = path.join(cfg.cwd, cfg.introspectionPath)
		await generateIntrospectionOnce(cfg, { fetch: responder(modified()) })
		const before = fs.readFileSync(source, "utf8")

		expect(await generateIntrospectionOnce(cfg, { fetch: responder(modified(excluded(), '"partial"')) })).toBe("generated")
		const after = fs.readFileSync(source, "utf8")
		expect(after).not.toBe(before)
		// The valid contributions in the same document, the one that arrived with it and the ones
		// that were already there. An exclusion costs its own contribution and nothing else.
		expect(after).toContain("WP_AcmeAlbum")
		expect(after).toContain("WP_AcmeBook")
	})

	test("writes the validated subset on a first generation, so the stub is never left in place", async () => {
		watchLog()
		const cfg = project()

		expect(await generateIntrospectionOnce(cfg, { fetch: responder(modified(excluded())) })).toBe("generated")
		expect(fs.readFileSync(path.join(cfg.cwd, cfg.introspectionPath), "utf8")).toContain("WP_AcmeBook")
	})

	test("names every exclusion and says the client is short of them", async () => {
		watchLog()
		const cfg = project()
		await generateIntrospectionOnce(cfg, { fetch: responder(modified(excluded())) })

		const errors = transcript("error")
		expect(errors).toContain("vendor.money")
		expect(errors).toContain("Referenced schema does not exist.")
		expect(errors).toContain("vendor.orders > /orders")
		// Two exclusions, counted by location rather than by diagnostic, and the warning that they are
		// missing from what was written. The fixture's own warning stays a warning and counts for nothing.
		expect(transcript("warn")).toContain("2 excluded contributions")
	})

	test("strict generation rejects it, leaving the client and its meta untouched", async () => {
		watchLog()
		const cfg = project()
		const source = path.join(cfg.cwd, cfg.introspectionPath)
		const meta = path.join(cfg.cwd, cfg.introspectionMetaPath)
		await generateIntrospectionOnce(cfg, { fetch: responder(modified()) })
		const [client, cache] = [fs.readFileSync(source, "utf8"), fs.readFileSync(meta, "utf8")]

		await expect(generateIntrospectionOnce(cfg, { strict: true, fetch: responder(modified(excluded())) })).rejects.toThrow(
			PartialContractError,
		)
		expect(fs.readFileSync(source, "utf8")).toBe(client)
		expect(fs.readFileSync(meta, "utf8")).toBe(cache)
		expect(transcript("error")).toContain("vendor.money")
	})

	test("strict generation refetches, so a warm cache cannot answer 304 over an exclusion", async () => {
		watchLog()
		const cfg = project()
		await generateIntrospectionOnce(cfg, { fetch: responder(modified()) })

		const fetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => modified(excluded()))
		await expect(generateIntrospectionOnce(cfg, { strict: true, fetch: fetch as unknown as typeof globalThis.fetch })).rejects.toThrow(
			PartialContractError,
		)
		expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get("If-None-Match")).toBeNull()
	})

	test("strict generation writes a contract that excluded nothing", async () => {
		watchLog()
		const cfg = project()

		expect(await generateIntrospectionOnce(cfg, { strict: true, fetch: responder(modified()) })).toBe("generated")
		expect(fs.readFileSync(path.join(cfg.cwd, cfg.introspectionPath), "utf8")).toContain("WP_AcmeBook")
	})
})

/**
 * Each test uses a plugin version no other test in this file has used: an outdated plugin is named
 * once per version for the life of the process, which is what keeps `kizlo dev`'s poll from repeating
 * the warning every few seconds.
 */
describe("the plugin version WordPress stamps on the contract", () => {
	function served(pluginVersion: string, body: IntrospectionDocument | null = INTROSPECTION_FIXTURE): Response {
		const headers = { etag: '"fixture"', "x-kizlo-version": pluginVersion }
		return body ? Response.json(body, { headers }) : new Response(null, { status: 304, headers })
	}

	test("names a plugin too old for this package at generation", async () => {
		watchLog()
		await generateIntrospectionOnce(project(), { fetch: responder(served("0.7.0")) })
		expect(transcript("warn")).toContain(pluginUpdateMessage("0.7.0"))
	})

	test("names it on a revalidated contract too, where nothing is generated", async () => {
		watchLog()
		const cfg = project()
		await generateIntrospectionOnce(cfg, { fetch: responder(served(MIN_PLUGIN_VERSION)) })
		expect(await generateIntrospectionOnce(cfg, { fetch: responder(served("0.6.0", null)) })).toBe("unchanged")
		expect(transcript("warn")).toContain(pluginUpdateMessage("0.6.0"))
	})

	test("says it once however often the client refetches", async () => {
		watchLog()
		const cfg = project()
		await generateIntrospectionOnce(cfg, { fetch: responder(served("0.5.0")) })
		await generateIntrospectionOnce(cfg, { fetch: responder(served("0.5.0", null)) })
		const said = transcript("warn")
			.split("\n")
			.filter((line) => line.includes("Kizlo plugin outdated"))
		expect(said).toHaveLength(1)
	})

	test("says nothing about a plugin new enough", async () => {
		watchLog()
		await generateIntrospectionOnce(project(), { fetch: responder(served(MIN_PLUGIN_VERSION)) })
		expect(transcript("warn")).not.toContain("Kizlo plugin outdated")
	})
})

describe("a document that would not compile", () => {
	test("refuses it, leaving the client and its ETag cache as they were", async () => {
		const cfg = project()
		await generateIntrospectionOnce(cfg, { fetch: responder(modified()) })

		const client = path.resolve(cfg.cwd, cfg.introspectionPath)
		const meta = path.resolve(cfg.cwd, cfg.introspectionMetaPath)
		const before = { client: fs.readFileSync(client, "utf8"), meta: fs.readFileSync(meta, "utf8") }

		vi.mocked(assertGeneratedClientCompiles).mockRejectedValueOnce(refused())
		await expect(generateIntrospectionOnce(cfg, { fetch: responder(modified(altered(), '"altered"')) })).rejects.toThrow(
			GeneratedClientTypeError,
		)

		expect(fs.readFileSync(client, "utf8")).toBe(before.client)
		expect(fs.readFileSync(meta, "utf8")).toBe(before.meta)
	})

	/**
	 * A server-less package's introspection stamps its ETag cache and writes the file. Stamping it for a
	 * generation that was then refused would answer the next poll with a 304 and never retry.
	 */
	test("refuses a server-less introspection without stamping its ETag cache", async () => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-generate-"))
		seedEnv(cwd)
		const cfg = standalone(cwd)

		vi.mocked(assertGeneratedClientCompiles).mockRejectedValueOnce(refused())
		await expect(generateIntrospectionOnce(cfg, { fetch: responder(modified()) })).rejects.toThrow(GeneratedClientTypeError)

		expect(fs.existsSync(path.resolve(cwd, cfg.introspectionMetaPath))).toBe(false)
		expect(fs.existsSync(path.resolve(cwd, cfg.introspectionPath))).toBe(false)
	})

	test("reports it as a diagnosis, naming the schema, without a stack", async () => {
		watchLog()
		const cfg = project()

		vi.mocked(assertGeneratedClientCompiles).mockRejectedValueOnce(refused())
		await generateIntrospectionOnce(cfg, { fetch: responder(modified()) }).catch((error: unknown) => {
			reportGenerationError("WordPress client generation failed", error)
		})

		expect(transcript("error")).toContain(`schema "acme.book"`)
		expect(transcript("error")).not.toContain("WordPress client generation failed")
	})
})
