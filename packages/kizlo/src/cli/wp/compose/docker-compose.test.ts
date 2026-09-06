import fs from "node:fs"
import { describe, expect, test } from "vitest"
import { parse } from "yaml"
import { APACHE_LISTEN_CONF, COMPOSE_FILE, UPLOADS_INI } from "../constants"

interface Service {
	environment?: Record<string, string>
	ports?: string[]
	volumes?: string[]
}

const wordpress = (): Service => parse(fs.readFileSync(COMPOSE_FILE, "utf8")).services.wordpress

/** Parse a `key=value` INI (comments/blank lines dropped) into a lookup. */
function ini(file: string): Record<string, string> {
	const out: Record<string, string> = {}
	for (const line of fs.readFileSync(file, "utf8").split("\n")) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith(";")) continue
		const eq = trimmed.indexOf("=")
		if (eq !== -1) out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
	}
	return out
}

/** PHP size shorthand (`2G`, `2100M`, `512K`) to bytes. */
function bytes(size: string): number {
	const match = /^(\d+)([KMG]?)$/i.exec(size)
	if (!match) throw new Error(`not a PHP size: ${size}`)
	const scale = { "": 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3 }[match[2]?.toUpperCase() ?? ""] ?? 1
	return Number(match[1]) * scale
}

describe("base compose wordpress service", () => {
	test("receives the published port so Apache can listen on it", () => {
		// Defaulted to the same value as the port mapping so a standalone `up` still parses.
		// The `${...}` here are literal Compose interpolation tokens, not JS templates.
		// biome-ignore lint/suspicious/noTemplateCurlyInString: literal Compose interpolation
		expect(wordpress().environment?.WP_PORT).toBe("${WP_PORT:-8080}")
		// biome-ignore lint/suspicious/noTemplateCurlyInString: literal Compose interpolation
		expect(wordpress().ports).toContain("${WP_PORT:-8080}:80")
	})

	test("mounts both local-only config assets read-only", () => {
		const volumes = wordpress().volumes ?? []
		expect(volumes).toContain("./uploads.ini:/usr/local/etc/php/conf.d/zz-kizlo-uploads.ini:ro")
		expect(volumes).toContain("./apache-listen.conf:/etc/apache2/conf-enabled/zz-kizlo-listen.conf:ro")
	})
})

describe("uploads.ini", () => {
	test("raises the upload ceiling to 2 GB", () => {
		expect(ini(UPLOADS_INI).upload_max_filesize).toBe("2G")
	})

	test("allows POST overhead above the file limit for the multipart envelope", () => {
		const values = ini(UPLOADS_INI)
		expect(bytes(values.post_max_size ?? "")).toBeGreaterThan(bytes(values.upload_max_filesize ?? ""))
	})
})

describe("apache-listen.conf", () => {
	test("listens on the injected published port", () => {
		expect(fs.readFileSync(APACHE_LISTEN_CONF, "utf8")).toMatch(/^\s*Listen\s+\$\{WP_PORT\}\s*$/m)
	})
})
