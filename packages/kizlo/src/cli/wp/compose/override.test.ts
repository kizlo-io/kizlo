import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { OPCACHE_INI, REMAP_ENTRYPOINT } from "../constants"
import { writeDevOverride, writeTestOverride } from "./override"

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
		expect(file).toBe(path.join(dir, ".kizlo", "docker-compose.dev.override.yml"))
		expect(fs.existsSync(wordpressDir)).toBe(true)

		const body = fs.readFileSync(file, "utf8")
		expect(body).toContain("  wordpress:")
		expect(body).toContain("  wp-cli:")
		expect(body).toContain(`- "${wordpressDir}:/var/www/html"`)
	})

	test("always mounts the dev OPcache config into the wordpress service, read-only", () => {
		const body = fs.readFileSync(writeDevOverride(dir, { wordpressDir, mounts: [] }), "utf8")
		expect(body).toContain(`- "${OPCACHE_INI}:/usr/local/etc/php/conf.d/zz-kizlo-opcache.ini:ro"`)
	})

	test("layers plugin mounts by basename, after the root bind", () => {
		const body = fs.readFileSync(writeDevOverride(dir, { wordpressDir, mounts: ["plugins/kizlo"] }), "utf8")
		const rootBind = `- "${wordpressDir}:/var/www/html"`
		const pluginBind = `- "${path.join(dir, "plugins/kizlo")}:/var/www/html/wp-content/plugins/kizlo"`
		expect(body).toContain(pluginBind)
		expect(body.indexOf(rootBind)).toBeLessThan(body.indexOf(pluginBind))
	})

	test("keeps absolute mount paths verbatim", () => {
		const abs = path.join(dir, "external", "my-plugin")
		const body = fs.readFileSync(writeDevOverride(dir, { wordpressDir, mounts: [abs] }), "utf8")
		expect(body).toContain(`- "${abs}:/var/www/html/wp-content/plugins/my-plugin"`)
	})

	test("publishes MySQL on the given host port, bound to loopback", () => {
		const body = fs.readFileSync(writeDevOverride(dir, { wordpressDir, mounts: [], dbPort: 3307 }), "utf8")
		expect(body).toContain("  mysql:")
		expect(body).toContain('- "127.0.0.1:3307:3306"')
	})

	test("leaves MySQL internal-only when no db port is given", () => {
		const body = fs.readFileSync(writeDevOverride(dir, { wordpressDir, mounts: [] }), "utf8")
		expect(body).not.toContain("  mysql:")
	})

	test("omits the uid-remap entrypoint when no host user is given (macOS/Windows)", () => {
		const body = fs.readFileSync(writeDevOverride(dir, { wordpressDir, mounts: [] }), "utf8")
		expect(body).not.toContain("entrypoint:")
		expect(body).not.toContain("KIZLO_PUID")
		expect(body).not.toContain("user:")
	})

	test("runs the container as the host user and injects the remap entrypoint (Linux)", () => {
		const body = fs.readFileSync(writeDevOverride(dir, { wordpressDir, mounts: [], hostUser: { uid: 1000, gid: 1000 } }), "utf8")
		expect(body).toContain('entrypoint: ["sh","/usr/local/bin/kizlo-remap-entrypoint.sh"]')
		expect(body).toContain(`- "${REMAP_ENTRYPOINT}:/usr/local/bin/kizlo-remap-entrypoint.sh:ro"`)
		expect(body).toContain('KIZLO_PUID: "1000"')
		expect(body).toContain('KIZLO_PGID: "1000"')
		// wp-cli runs directly as the host user (no entrypoint wrapper needed there).
		expect(body).toContain('user: "1000:1000"')
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
		expect(file).toBe(path.join(dir, ".kizlo", "docker-compose.test.override.yml"))

		const body = fs.readFileSync(file, "utf8")
		const pluginBind = `- "${path.join(dir, "plugins/kizlo-woocommerce")}:/var/www/html/wp-content/plugins/kizlo-woocommerce"`
		expect(body).toContain("  wordpress:")
		expect(body).toContain("  wp-cli:")
		// One bind per service.
		expect(body.split(pluginBind).length - 1).toBe(2)
	})

	test("keeps absolute mount paths verbatim", () => {
		const abs = path.join(dir, "external", "my-plugin")
		const body = fs.readFileSync(writeTestOverride(dir, [abs]), "utf8")
		expect(body).toContain(`- "${abs}:/var/www/html/wp-content/plugins/my-plugin"`)
	})

	test("touches nothing but plugin mounts — no root bind, OPcache, or db port", () => {
		const body = fs.readFileSync(writeTestOverride(dir, ["plugins/kizlo"]), "utf8")
		expect(body).not.toContain(':/var/www/html"')
		expect(body).not.toContain("opcache")
		expect(body).not.toContain("  mysql:")
	})
})
