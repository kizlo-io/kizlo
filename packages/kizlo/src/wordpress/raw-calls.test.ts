import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const HERE = fileURLToPath(new URL(".", import.meta.url))
const PACKAGES = path.resolve(HERE, "../../..")

/**
 * A raw transport call: one of the verbs read off something named after the WordPress client,
 * rather than the endpoint the generated tree already describes.
 */
const RAW_CALL = /\b\w*[wW]ordpress\.(get|post|put|patch|delete)\s*(?:<[^>]*>)?\s*\(\s*([^,)]+)/g

/**
 * Runtime code that is allowed to reach the transport directly.
 *
 * - `wordpress/` is the transport itself, and the tree it binds.
 * - `cli/` runs before a client has been generated, so it has nothing to call through.
 * - Harnesses, fixtures and tests seed WordPress rather than serve from it.
 */
const EXEMPT = [
	`packages${path.sep}kizlo${path.sep}src${path.sep}wordpress${path.sep}`,
	`packages${path.sep}kizlo${path.sep}src${path.sep}cli${path.sep}`,
	`${path.sep}src${path.sep}test${path.sep}`,
]

function isExempt(file: string): boolean {
	const base = path.basename(file)
	if (base.includes(".test.") || base.includes(".test-d.") || base.includes("fixture")) return true
	return EXEMPT.some((fragment) => file.includes(fragment))
}

/**
 * The routes still called raw, listed exactly. A call this list does not name fails the test, so the
 * only way to add one is to say so here.
 *
 * It is empty, and the intent is that it stays that way. It held the WooCommerce Store API and REST
 * v3 routes while the plugin had yet to describe them, and each dropped off as its spec landed.
 * Every route framework-owned procedures or services reach for now has a generated endpoint.
 */
const ALLOWED: Record<string, string[]> = {}

function sourceFiles(directory: string): string[] {
	return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const full = path.join(directory, entry.name)
		if (entry.isDirectory()) return entry.name === "node_modules" || entry.name === "dist" ? [] : sourceFiles(full)
		return entry.isFile() && entry.name.endsWith(".ts") ? [full] : []
	})
}

/** The route a call names, with quoting and any interpolated segment reduced to `*`. */
function route(argument: string): string {
	return argument
		.trim()
		.replace(/^[`'"]|[`'"]$/g, "")
		.replace(/\$\{[^}]*\}/g, "*")
}

export function findRawCalls(source: string): string[] {
	return [...source.matchAll(RAW_CALL)].map((match) => route(match[2] ?? ""))
}

describe("raw WordPress calls", () => {
	test("production procedures and services go through the generated endpoints", () => {
		const found: Record<string, string[]> = {}

		for (const file of sourceFiles(PACKAGES)) {
			if (isExempt(file)) continue
			const calls = findRawCalls(fs.readFileSync(file, "utf8"))
			if (calls.length) found[path.relative(path.resolve(PACKAGES, ".."), file).split(path.sep).join("/")] = calls.sort()
		}

		const expected = Object.fromEntries(Object.entries(ALLOWED).map(([file, calls]) => [file, [...calls].sort()]))
		expect(found).toEqual(expected)
	})

	test("a newly added raw call is reported", () => {
		const added = `const response = await context.wordpress.post<Thing, "bad">("/things", { base: WP_KIZLO_BASE })`
		expect(findRawCalls(added)).toEqual(["/things"])
	})
})
