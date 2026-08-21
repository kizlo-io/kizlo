import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { parse } from "yaml"
import { OPCACHE_INI, REMAP_ENTRYPOINT } from "../constants"
import { writeDevOverride, writeTestOverride } from "./override"

interface Service {
	user?: string
	entrypoint?: string[]
	environment?: Record<string, string>
	ports?: string[]
	volumes?: string[]
}

/**
 * Parse a generated override the way Compose does. Asserting on parsed values rather
 * than on the raw text is what catches a file that a YAML reader rejects outright.
 */
function read(file: string): Record<string, Service> {
	return parse(fs.readFileSync(file, "utf8")).services
}

describe("writeDevOverride", () => {
	let dir: string
	let wordpressDir: string

	beforeEach(() => {
		dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-ovr-")))
		wordpressDir = path.join(dir, "wordpress")
	})

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true })
	})

	test("bind-mounts the whole install on both services and creates the host dir", () => {
		const file = writeDevOverride(dir, { wordpressDir, mounts: [] })
		expect(file).toBe(path.join(dir, ".kizlo", "compose.local.yml"))
		expect(fs.existsSync(wordpressDir)).toBe(true)

		const services = read(file)
		expect(Object.keys(services)).toEqual(["wordpress", "wp-cli"])
		expect(services.wordpress?.volumes).toContain(`${wordpressDir}:/var/www/html`)
		expect(services["wp-cli"]?.volumes).toContain(`${wordpressDir}:/var/www/html`)
	})

	test("always mounts the dev OPcache config into the wordpress service, read-only", () => {
		const services = read(writeDevOverride(dir, { wordpressDir, mounts: [] }))
		expect(services.wordpress?.volumes).toContain(`${OPCACHE_INI}:/usr/local/etc/php/conf.d/zz-kizlo-opcache.ini:ro`)
	})

	test("layers plugin mounts by basename, after the root bind", () => {
		const volumes = read(writeDevOverride(dir, { wordpressDir, mounts: ["plugins/kizlo"] })).wordpress?.volumes ?? []
		const rootBind = `${wordpressDir}:/var/www/html`
		const pluginBind = `${path.join(dir, "plugins/kizlo")}:/var/www/html/wp-content/plugins/kizlo`
		expect(volumes).toContain(pluginBind)
		expect(volumes.indexOf(rootBind)).toBeLessThan(volumes.indexOf(pluginBind))
	})

	test("keeps absolute mount paths verbatim", () => {
		const abs = path.join(dir, "external", "my-plugin")
		const services = read(writeDevOverride(dir, { wordpressDir, mounts: [abs] }))
		expect(services.wordpress?.volumes).toContain(`${abs}:/var/www/html/wp-content/plugins/my-plugin`)
	})

	test("publishes MySQL on the given host port, bound to loopback", () => {
		const services = read(writeDevOverride(dir, { wordpressDir, mounts: [], dbPort: 3307 }))
		expect(services.mysql?.ports).toEqual(["127.0.0.1:3307:3306"])
	})

	test("leaves MySQL internal-only when no db port is given", () => {
		expect(read(writeDevOverride(dir, { wordpressDir, mounts: [] })).mysql).toBeUndefined()
	})

	test("omits the uid-remap entrypoint when no host user is given (macOS/Windows)", () => {
		const services = read(writeDevOverride(dir, { wordpressDir, mounts: [] }))
		expect(services.wordpress?.entrypoint).toBeUndefined()
		expect(services.wordpress?.environment).toBeUndefined()
		expect(services.wordpress?.user).toBeUndefined()
		expect(services["wp-cli"]?.user).toBeUndefined()
	})

	test("runs the container as the host user and injects the remap entrypoint (Linux)", () => {
		const services = read(writeDevOverride(dir, { wordpressDir, mounts: [], hostUser: { uid: 1000, gid: 1000 } }))
		expect(services.wordpress?.entrypoint).toEqual(["sh", "/usr/local/bin/kizlo-remap-entrypoint.sh"])
		expect(services.wordpress?.volumes).toContain(`${REMAP_ENTRYPOINT}:/usr/local/bin/kizlo-remap-entrypoint.sh:ro`)
		expect(services.wordpress?.environment).toEqual({ KIZLO_PUID: "1000", KIZLO_PGID: "1000" })
		expect(services.wordpress?.user).toBe("0:0")
		expect(services["wp-cli"]?.user).toBe("1000:1000")
	})
})

describe("writeTestOverride", () => {
	let dir: string

	beforeEach(() => {
		dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-tovr-")))
	})

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true })
	})

	test("mounts local plugin dirs by basename on both services", () => {
		const file = writeTestOverride(dir, ["plugins/kizlo-woocommerce"])
		expect(file).toBe(path.join(dir, ".kizlo", "compose.test.yml"))

		const services = read(file)
		const pluginBind = `${path.join(dir, "plugins/kizlo-woocommerce")}:/var/www/html/wp-content/plugins/kizlo-woocommerce`
		expect(services.wordpress?.volumes).toEqual([pluginBind])
		expect(services["wp-cli"]?.volumes).toEqual([pluginBind])
	})

	test("keeps absolute mount paths verbatim", () => {
		const abs = path.join(dir, "external", "my-plugin")
		const services = read(writeTestOverride(dir, [abs]))
		expect(services.wordpress?.volumes).toContain(`${abs}:/var/www/html/wp-content/plugins/my-plugin`)
	})

	test("touches nothing but plugin mounts, no root bind, OPcache, or db port", () => {
		const services = read(writeTestOverride(dir, ["plugins/kizlo"]))
		expect(services.mysql).toBeUndefined()
		for (const volume of services.wordpress?.volumes ?? []) {
			expect(volume.endsWith(":/var/www/html")).toBe(false)
			expect(volume).not.toContain("opcache")
		}
	})
})

/**
 * Every value the generator interpolates is host-controlled, so it has to survive both
 * readers of the file: the YAML parser, then Compose's `$` interpolation.
 */
describe("quoting", () => {
	let dir: string

	beforeEach(() => {
		dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-quote-")))
	})

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true })
	})

	test("keeps a Windows host path intact instead of reading it as escape codes", () => {
		const win = String.raw`C:\Users\me\proj\.kizlo\local`
		const services = read(writeTestOverride(dir, [win]))
		expect(services.wordpress?.volumes?.[0]).toBe(`${path.join(dir, win)}:/var/www/html/wp-content/plugins/${win}`)
	})

	test("survives quotes and apostrophes in a host path", () => {
		const odd = `we"ird's-plugin`
		const services = read(writeTestOverride(dir, [path.join(dir, odd)]))
		expect(services.wordpress?.volumes?.[0]).toBe(`${path.join(dir, odd)}:/var/www/html/wp-content/plugins/${odd}`)
	})

	test("doubles `$` so Compose passes it through as a literal instead of interpolating", () => {
		const services = read(writeTestOverride(dir, [path.join(dir, "cost$plugin")]))
		expect(services.wordpress?.volumes?.[0]).toContain("cost$$plugin")
	})

	test("carries the same escaping through the dev override's root bind and env", () => {
		const wordpressDir = path.join(dir, String.raw`w"eird$dir\local`)
		const services = read(writeDevOverride(dir, { wordpressDir, mounts: [], hostUser: { uid: 1000, gid: 1000 } }))
		expect(services.wordpress?.volumes).toContain(`${wordpressDir.replaceAll("$", () => "$$")}:/var/www/html`)
		expect(fs.existsSync(wordpressDir)).toBe(true)
	})
})
